import { Hono } from 'hono';
import { deleteCookie } from 'hono/cookie';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { updateUserSchema } from '../lib/schemas.js';
import { apiLimiter } from '../lib/rate-limit.js';
import { accountDeletionBillingBlock } from './billing.js';

/**
 * @module user
 * @description Routes for managing user profile.
 */
export const user = new Hono();

/**
 * GET /me
 * @description Get current authenticated user's profile and usage stats.
 * @returns {object} User profile details.
 */
user.get('/me', requireAuth, apiLimiter, async (c) => {
  const authUser = c.get('user');
  
  const dbUser = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: {
      id: true,
      login: true,
      name: true,
      email: true,
      avatarUrl: true,
      createdAt: true,
      subscriptionTier: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      _count: {
        select: { repos: true },
      },
    },
  });

  if (!dbUser) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({
    id: dbUser.id,
    login: dbUser.login,
    name: dbUser.name,
    email: dbUser.email,
    avatarUrl: dbUser.avatarUrl,
    createdAt: dbUser.createdAt,
    subscriptionTier: dbUser.subscriptionTier,
    subscriptionStatus: dbUser.subscriptionStatus,
    trialEndsAt: dbUser.trialEndsAt,
    repoCount: dbUser._count.repos,
  });
});

/**
 * PATCH /me
 * @description Update user profile information.
 * @body {string} [name] - New display name.
 * @returns {object} Success message.
 */
user.patch(
  '/me',
  requireAuth,
  apiLimiter,
  zValidator('json', updateUserSchema),
  async (c) => {
    const authUser = c.get('user');
    const { name } = c.req.valid('json');

    if (name !== undefined) {
      await prisma.user.update({
        where: { id: authUser.id },
        data: { name },
      });
    }

    return c.json({ success: true });
  }
);

/**
 * DELETE /me
 * @description Permanently delete user account and all data.
 * @returns {object} Success message.
 */
user.delete('/me', requireAuth, apiLimiter, async (c) => {
  const authUser = c.get('user');

  const result = await prisma.$transaction(async (tx) => {
    // Serialize deletion with checkout creation for this account.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${authUser.id} FOR UPDATE`;
    const dbUser = await tx.user.findUnique({
      where: { id: authUser.id },
      select: {
        stripeSubscriptionId: true,
        stripeCustomerId: true,
        subscriptionStatus: true,
        _count: { select: { ownedOrganizations: true, repos: true } },
      },
    });

    if (!dbUser) return { error: 'User not found', status: 404 as const };

    if (dbUser.stripeSubscriptionId && !['canceled', 'incomplete_expired'].includes(dbUser.subscriptionStatus ?? '')) {
      return {
        error: 'Your subscription must be fully canceled before deleting your account. Manage your subscription in the billing portal first.',
        status: 409 as const,
      };
    }

    if (dbUser._count.ownedOrganizations > 0) {
      return {
        error: 'You own an organization. Contact support to transfer or remove it before deleting your account.',
        status: 409 as const,
      };
    }

    if (dbUser._count.repos > 0) {
      return {
        error: 'Disconnect your repositories before deleting your account so their GitHub webhooks can be removed safely.',
        status: 409 as const,
      };
    }

    if (dbUser.stripeSubscriptionId && !dbUser.stripeCustomerId) {
      return { error: 'Your billing account could not be verified. Contact support before deleting your account.', status: 503 as const };
    }
    if (dbUser.stripeCustomerId) {
      const billingBlock = await accountDeletionBillingBlock(dbUser.stripeCustomerId);
      if (billingBlock) return billingBlock;
    }

    // Pending invitations reference their sender without a cascade. Remove them
    // with the account, while memberships and personal repositories cascade.
    await tx.organizationInvite.deleteMany({ where: { invitedById: authUser.id } });
    await tx.user.delete({ where: { id: authUser.id } });
    return null;
  }, { maxWait: 10_000, timeout: 60_000 });

  if (result) return c.json({ error: result.error }, result.status);

  const cookieOptions = { path: '/', secure: process.env.NODE_ENV === 'production', sameSite: 'Lax' as const };
  deleteCookie(c, 'shiplog_session', { ...cookieOptions, httpOnly: true });
  deleteCookie(c, 'shiplog_logged_in', cookieOptions);

  return c.json({ success: true });
});

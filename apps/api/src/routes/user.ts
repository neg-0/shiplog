import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { updateUserSchema } from '../lib/schemas.js';
import { apiLimiter } from '../lib/rate-limit.js';

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
  
  // This will cascade delete repos, configs, releases, etc.
  await prisma.user.delete({
    where: { id: authUser.id },
  });
  
  return c.json({ success: true });
});

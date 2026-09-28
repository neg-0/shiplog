import { Hono, type Context, type Next } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { apiLimiter } from '../lib/rate-limit.js';

// Admin middleware
const requireAdmin = async (c: Context, next: Next) => {
  const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
  const user = c.get('user');
  if (!user || !user.email || !ADMIN_EMAILS.includes(user.email)) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  return next();
};

export const admin = new Hono();

/**
 * @module admin
 * @description Administrative routes for managing users and viewing metrics.
 */

// Admin responses contain account data and must not be stored by shared caches.
admin.use('*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'private, no-store');
});

// Apply auth + admin middleware to all routes
admin.use('*', requireAuth, apiLimiter, requireAdmin);

/**
 * GET /metrics
 * @description Get operational metrics from ShipLog's database. Financial amounts
 * are deliberately absent because invoices, discounts and payments live in Stripe.
 */
admin.get('/metrics', async (c) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [
    totalUsers,
    freeUsers,
    proUsers,
    teamUsers,
    totalRepos,
    totalReleases,
    totalOrganizations,
    newUsers,
    newReleases,
    activeRepos,
    errorRepos,
    failedReleases,
    stuckReleases,
    sentExternalDeliveries,
    failedExternalDeliveries,
    noteUsage,
    notesWithoutUsage,
    activePaidPlans,
    trialingPlans,
    pastDuePlans,
    paidTiersWithoutSubscription,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { subscriptionTier: 'FREE' } }),
    prisma.user.count({ where: { subscriptionTier: 'PRO' } }),
    prisma.user.count({ where: { subscriptionTier: 'TEAM' } }),
    prisma.repo.count(),
    prisma.release.count(),
    prisma.organization.count(),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.release.count({ where: { createdAt: { gte: since } } }),
    prisma.repo.count({ where: { status: 'ACTIVE' } }),
    prisma.repo.count({ where: { status: 'ERROR' } }),
    prisma.release.count({ where: { status: { in: ['FAILED', 'PARTIAL_SUCCESS'] } } }),
    prisma.release.count({ where: { status: 'PROCESSING', updatedAt: { lt: new Date(Date.now() - 15 * 60 * 1000) } } }),
    prisma.distribution.count({ where: { status: 'SENT', hostedChangelog: false, createdAt: { gte: since } } }),
    prisma.distribution.count({ where: { status: 'FAILED', hostedChangelog: false, createdAt: { gte: since } } }),
    prisma.generatedNotes.aggregate({ where: { createdAt: { gte: since } }, _count: { id: true }, _sum: { tokensUsed: true } }),
    prisma.generatedNotes.count({ where: { createdAt: { gte: since }, tokensUsed: null } }),
    prisma.user.count({ where: { subscriptionTier: { in: ['PRO', 'TEAM'] }, subscriptionStatus: 'active', stripeSubscriptionId: { not: null } } }),
    prisma.user.count({ where: { subscriptionStatus: 'trialing', stripeSubscriptionId: { not: null } } }),
    prisma.user.count({ where: { subscriptionStatus: 'past_due', stripeSubscriptionId: { not: null } } }),
    prisma.user.count({ where: { subscriptionTier: { in: ['PRO', 'TEAM'] }, stripeSubscriptionId: null } }),
  ]);

  return c.json({
    periodDays: 30,
    users: {
      total: totalUsers,
      free: freeUsers,
      pro: proUsers,
      team: teamUsers,
      new: newUsers,
    },
    organizations: totalOrganizations,
    repos: { total: totalRepos, active: activeRepos, error: errorRepos },
    releases: { total: totalReleases, new: newReleases, needingAttention: failedReleases, stuckProcessing: stuckReleases },
    deliveries: { sentExternal: sentExternalDeliveries, failedExternalAttempts: failedExternalDeliveries },
    ai: { savedDrafts: noteUsage._count.id, recordedTokens: noteUsage._sum.tokensUsed ?? 0, missingTokenCounts: notesWithoutUsage },
    billing: {
      activePaidPlanRecords: activePaidPlans,
      trialingPlanRecords: trialingPlans,
      pastDuePlanRecords: pastDuePlans,
      paidTierWithoutSubscription: paidTiersWithoutSubscription,
      collectedRevenue: null,
      mrr: null,
      reason: 'Stripe invoice and payment amounts are not stored in ShipLog.',
    },
  });
});

const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(100).optional(),
  tier: z.enum(['FREE', 'PRO', 'TEAM']).optional(),
});

/**
 * GET /users
 * @description List all users with pagination and filtering.
 */
admin.get('/users', zValidator('query', listUsersSchema), async (c) => {
  const { page, limit, search, tier } = c.req.valid('query');

  const where: Prisma.UserWhereInput = {};
  
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { login: { contains: search, mode: 'insensitive' } },
    ];
  }
  
  if (tier) {
    where.subscriptionTier = tier;
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        login: true,
        name: true,
        email: true,
        avatarUrl: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        stripeSubscriptionId: true,
        trialEndsAt: true,
        createdAt: true,
        _count: { select: { repos: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  // Aggregate through repositories and releases without loading release bodies
  // or recipient addresses into the admin response.
  const ids = users.map(user => user.id);
  const counts = ids.length ? await prisma.$queryRaw<Array<{ userId: string; releaseCount: bigint; externalDeliveryCount: bigint }>>(
    Prisma.sql`
      SELECT r."userId" AS "userId",
        COUNT(DISTINCT rel.id) AS "releaseCount",
        COUNT(d.id) AS "externalDeliveryCount"
      FROM repos r
      LEFT JOIN releases rel ON rel."repoId" = r.id
      LEFT JOIN distributions d ON d."releaseId" = rel.id
        AND d.status = 'SENT' AND d."hostedChangelog" = false
      WHERE r."userId" IN (${Prisma.join(ids)})
      GROUP BY r."userId"
    `,
  ) : [];
  const countsByUser = new Map(counts.map(row => [row.userId, row]));

  return c.json({
    users: users.map(user => ({
      id: user.id,
      login: user.login,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      subscriptionTier: user.subscriptionTier,
      subscriptionStatus: user.subscriptionStatus,
      hasStripeSubscription: Boolean(user.stripeSubscriptionId),
      trialEndsAt: user.trialEndsAt,
      createdAt: user.createdAt,
      repoCount: user._count.repos,
      releaseCount: Number(countsByUser.get(user.id)?.releaseCount ?? 0),
      externalDeliveryCount: Number(countsByUser.get(user.id)?.externalDeliveryCount ?? 0),
    })),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * GET /users/:id
 * @description Get detailed information for a specific user.
 */
admin.get('/users/:id', async (c) => {
  const userId = c.req.param('id');
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      login: true,
      name: true,
      email: true,
      avatarUrl: true,
      githubId: true,
      subscriptionTier: true,
      createdAt: true,
      updatedAt: true,
      repos: {
        select: {
          id: true,
          name: true,
          fullName: true,
          _count: { select: { releases: true } },
        },
      },
    },
  });

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json(user);
});

/**
 * PATCH /users/:id
 * @description Disabled: plan changes need Stripe synchronization.
 */
admin.patch('/users/:id', (c) => c.json({
  error: 'Plan changes must be made through Stripe billing; direct tier edits are disabled.',
}, 409));

/**
 * DELETE /users/:id
 * @description Disabled: direct deletion skips billing and webhook cleanup.
 */
admin.delete('/users/:id', (c) => c.json({
  error: 'Admin deletion is disabled. Account deletion requires billing and webhook cleanup.',
}, 409));

const listOrganizationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(100).optional(),
});

/** GET /organizations — read-only team directory for operational review. */
admin.get('/organizations', zValidator('query', listOrganizationsSchema), async (c) => {
  const { page, limit, search } = c.req.valid('query');
  const where: Prisma.OrganizationWhereInput = search ? {
    OR: [
      { name: { contains: search, mode: 'insensitive' } },
      { slug: { contains: search, mode: 'insensitive' } },
      { owner: { login: { contains: search, mode: 'insensitive' } } },
    ],
  } : {};
  const [organizations, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        ownerId: true,
        subscriptionId: true,
        createdAt: true,
        owner: { select: { id: true, login: true, email: true, subscriptionTier: true, subscriptionStatus: true, stripeSubscriptionId: true } },
        members: { select: { role: true, user: { select: { id: true, login: true, email: true } } }, orderBy: { joinedAt: 'asc' } },
        _count: { select: { members: true, repos: true } },
      },
    }),
    prisma.organization.count({ where }),
  ]);
  return c.json({
    organizations: organizations.map(org => {
      const warnings: string[] = [];
      if (org.owner.subscriptionTier !== 'TEAM') warnings.push('Owner is not on a Team tier');
      if (!org.subscriptionId) warnings.push('No linked subscription');
      if (org.subscriptionId && org.owner.stripeSubscriptionId && org.subscriptionId !== org.owner.stripeSubscriptionId) {
        warnings.push('Team subscription differs from owner subscription');
      }
      if (!org.members.some(member => member.user.id === org.ownerId && member.role === 'OWNER')) {
        warnings.push('Owner membership is missing');
      }
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        createdAt: org.createdAt,
        owner: { id: org.owner.id, login: org.owner.login, email: org.owner.email, subscriptionTier: org.owner.subscriptionTier, subscriptionStatus: org.owner.subscriptionStatus },
        memberCount: org._count.members,
        repoCount: org._count.repos,
        members: org.members.map(member => ({ role: member.role, user: member.user })),
        warnings,
      };
    }),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

const activitySchema = z.object({
  limit: z.string().optional().transform(v => Math.min(100, Math.max(1, parseInt(v || '100')))),
});

/**
 * GET /activity
 * @description Get a combined feed of recent signups, releases and external send attempts.
 */
admin.get('/activity', zValidator('query', activitySchema), async (c) => {
  const { limit } = c.req.valid('query');
  
  const recentUsers = await prisma.user.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      login: true,
      email: true,
      subscriptionTier: true,
      createdAt: true,
    },
  });

  const recentReleases = await prisma.release.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      tagName: true,
      createdAt: true,
      repo: {
        select: {
          name: true,
          fullName: true,
          user: { select: { login: true } },
        },
      },
    },
  });

  const recentDeliveries = await prisma.distribution.findMany({
    where: { hostedChangelog: false, status: { in: ['SENT', 'FAILED'] } },
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, createdAt: true, release: { select: { tagName: true, repo: { select: { fullName: true } } } } },
  });

  const events = [
    ...recentUsers.map((u: any) => ({
      type: 'signup' as const,
      id: u.id,
      description: `${u.login} signed up (${u.subscriptionTier})`,
      createdAt: u.createdAt,
    })),
    ...recentReleases.map((r: any) => ({
      type: 'release' as const,
      id: r.id,
      description: `${r.repo.fullName} received release ${r.tagName}`,
      createdAt: r.createdAt,
    })),
    ...recentDeliveries.map(d => ({
      type: 'delivery' as const,
      id: d.id,
      description: `${d.status === 'SENT' ? 'Sent' : 'Failed to send'} ${d.release.repo.fullName} ${d.release.tagName} to an external destination`,
      createdAt: d.createdAt,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
   .slice(0, limit);

  return c.json({ events });
});

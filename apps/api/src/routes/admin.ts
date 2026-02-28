import { Hono, type Context, type Next } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { apiLimiter } from '../lib/rate-limit.js';
import { updateUserAdminSchema } from '../lib/schemas.js';

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

// Apply auth + admin middleware to all routes
admin.use('*', requireAuth, apiLimiter, requireAdmin);

/**
 * GET /metrics
 * @description Get high-level metrics for the admin dashboard.
 * @returns {object} Statistics about users, subscriptions, repositories, releases, and estimated MRR.
 */
admin.get('/metrics', async (c) => {
  const [
    totalUsers,
    freeUsers,
    proUsers,
    teamUsers,
    totalRepos,
    totalReleases,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { subscriptionTier: 'FREE' } }),
    prisma.user.count({ where: { subscriptionTier: 'PRO' } }),
    prisma.user.count({ where: { subscriptionTier: 'TEAM' } }),
    prisma.repo.count(),
    prisma.release.count(),
  ]);

  // Calculate MRR estimate
  const mrr = (proUsers * 29) + (teamUsers * 79);

  return c.json({
    users: {
      total: totalUsers,
      free: freeUsers,
      pro: proUsers,
      team: teamUsers,
    },
    repos: totalRepos,
    releases: totalReleases,
    mrr,
  });
});

const listUsersSchema = z.object({
  page: z.string().optional().transform(v => Math.max(1, parseInt(v || '1'))),
  limit: z.string().optional().transform(v => Math.min(100, Math.max(1, parseInt(v || '50')))),
  search: z.string().optional(),
  tier: z.enum(['FREE', 'PRO', 'TEAM']).optional(),
});

/**
 * GET /users
 * @description List all users with pagination and filtering.
 */
admin.get('/users', zValidator('query', listUsersSchema), async (c) => {
  const { page, limit, search, tier } = c.req.valid('query');

  const where: any = {};
  
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { login: { contains: search, mode: 'insensitive' } },
    ];
  }
  
  if (tier) {
    where.subscriptionTier = tier as string;
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
        createdAt: true,
        _count: { select: { repos: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return c.json({
    users: users.map((u: any) => ({
      ...u,
      repoCount: u._count.repos,
      _count: undefined,
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
 * @description Update a user's information.
 */
admin.patch(
  '/users/:id',
  zValidator('json', updateUserAdminSchema),
  async (c) => {
    const userId = c.req.param('id');
    const { subscriptionTier } = c.req.valid('json');

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(subscriptionTier && { subscriptionTier: subscriptionTier as 'FREE' | 'PRO' | 'TEAM' }),
      },
    });

    return c.json(updated);
  }
);

/**
 * DELETE /users/:id
 * @description Delete a user and their associated data.
 */
admin.delete('/users/:id', async (c) => {
  const userId = c.req.param('id');
  
  const currentUser = c.get('user');
  if (userId === currentUser.id) {
    return c.json({ error: 'Cannot delete your own admin account' }, 400);
  }

  await prisma.user.delete({
    where: { id: userId },
  });

  return c.json({ success: true });
});

const activitySchema = z.object({
  limit: z.string().optional().transform(v => Math.min(100, Math.max(1, parseInt(v || '100')))),
});

/**
 * GET /activity
 * @description Get a combined feed of recent system activity (signups, releases).
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
      description: `${r.repo.fullName} released ${r.tagName}`,
      createdAt: r.createdAt,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
   .slice(0, limit);

  return c.json({ events });
});

import { Hono } from 'hono';
import { prisma } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';

// Admin emails from environment variable
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

// Admin middleware
const requireAdmin = async (c: any, next: any) => {
  const user = c.get('user');
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await next();
};

export const admin = new Hono();

// Apply auth + admin middleware to all routes
admin.use('*', requireAuth, requireAdmin);

// Get metrics dashboard data
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

// List all users
admin.get('/users', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '50');
  const search = c.req.query('search') || '';
  const tier = c.req.query('tier') || '';

  const where: any = {};
  
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { login: { contains: search, mode: 'insensitive' } },
    ];
  }
  
  if (tier && ['FREE', 'PRO', 'TEAM'].includes(tier)) {
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
        createdAt: true,
        _count: { select: { repos: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return c.json({
    users: users.map(u => ({
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

// Get single user
admin.get('/users/:id', async (c) => {
  const userId = c.req.param('id');
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
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

// Update user
admin.patch('/users/:id', async (c) => {
  const userId = c.req.param('id');
  const body = await c.req.json();
  
  const { subscriptionTier } = body;
  
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(subscriptionTier && { subscriptionTier }),
    },
  });

  return c.json(updated);
});

// Delete user
admin.delete('/users/:id', async (c) => {
  const userId = c.req.param('id');
  
  await prisma.user.delete({
    where: { id: userId },
  });

  return c.json({ success: true });
});

// Get recent activity
admin.get('/activity', async (c) => {
  const limit = parseInt(c.req.query('limit') || '100');
  
  // Get recent users
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

  // Get recent releases
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

  // Combine and sort
  const events = [
    ...recentUsers.map(u => ({
      type: 'signup' as const,
      id: u.id,
      description: `${u.login} signed up (${u.subscriptionTier})`,
      createdAt: u.createdAt,
    })),
    ...recentReleases.map(r => ({
      type: 'release' as const,
      id: r.id,
      description: `${r.repo.fullName} released ${r.tagName}`,
      createdAt: r.createdAt,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
   .slice(0, limit);

  return c.json({ events });
});

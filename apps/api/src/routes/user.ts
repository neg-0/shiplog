import { Hono } from 'hono';
import { prisma } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';

export const user = new Hono();

// Get current user info
user.get('/me', requireAuth, async (c) => {
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
    repoCount: dbUser._count.repos,
  });
});

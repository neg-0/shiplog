import { Hono } from 'hono';
import { prisma } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';

export const activity = new Hono();

// Get recent activity (releases)
activity.get('/', requireAuth, async (c) => {
  const authUser = c.get('user');

  const releases = await prisma.release.findMany({
    where: {
      repo: {
        userId: authUser.id,
      },
      publishedAt: {
        not: null
      }
    },
    take: 50,
    orderBy: {
      publishedAt: 'desc',
    },
    include: {
      repo: {
        select: {
          name: true,
          owner: true,
        }
      }
    },
  });

  return c.json({ releases });
});

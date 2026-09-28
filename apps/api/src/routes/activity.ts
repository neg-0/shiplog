import { Hono } from 'hono';
import { prisma } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { apiLimiter } from '../lib/rate-limit.js';
import { readableRepo } from '../lib/repo-access.js';

export const activity = new Hono();

/**
 * @module activity
 * @description Routes for fetching recent user activity.
 */

/**
 * GET /
 * @description Fetch recent releases across all repositories for the authenticated user.
 * @param {string} [limit=50] - Number of items to retrieve (default: 50).
 * @returns {object} JSON object containing an array of recent releases with repo details.
 */
activity.get('/', requireAuth, apiLimiter, async (c) => {
  const authUser = c.get('user');

  const releases = await prisma.release.findMany({
    where: {
      repo: await readableRepo(authUser.id),
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

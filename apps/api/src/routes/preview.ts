import { Hono } from 'hono';
import { prisma } from '../lib/db.js';

/**
 * @module preview
 * @description Routes for previewing generated changelogs.
 */
export const preview = new Hono();

/**
 * GET /:slug
 * @description Get a pre-generated changelog preview.
 * @param {string} slug - Unique preview slug.
 * @returns {object} Preview details including generated notes.
 * @throws 404 if preview not found.
 */
preview.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  
  const changelog = await prisma.preGenChangelog.findUnique({
    where: { slug },
  });

  if (!changelog) {
    return c.json({ error: 'Preview not found' }, 404);
  }

  // Increment view count
  await prisma.preGenChangelog.update({
    where: { id: changelog.id },
    data: { views: { increment: 1 } },
  });

  let notes = null;
  try {
    notes = JSON.parse(changelog.body);
  } catch (e) {
    // Fallback if body is plain text
    notes = { customer: changelog.body };
  }

  return c.json({
    id: changelog.id,
    repoOwner: changelog.repoOwner,
    repoName: changelog.repoName,
    title: changelog.title,
    notes,
    createdAt: changelog.createdAt,
  });
});

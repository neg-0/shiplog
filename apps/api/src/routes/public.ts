import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '../lib/db.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { sanitizeHtml } from '../lib/sanitize.js';
import { logger } from '../lib/logger.js';

/**
 * @module public
 * @description Public-facing routes for changelogs and feedback.
 */
export const publicChangelog = new Hono();

const publicLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100,
});

const feedbackLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  message: 'Too many feedback submissions'
});

// Apply general rate limit to all public routes
publicChangelog.use('*', publicLimit);

const feedbackSchema = z.object({
  repoId: z.string().min(1),
  feedback: z.string().min(1).max(2000), // Limit length
  email: z.string().email().optional().or(z.literal('')),
  source: z.string().optional(),
});

/**
 * POST /feedback
 * @description Submit feedback for a specific repository.
 */
publicChangelog.post('/feedback', feedbackLimit, zValidator('json', feedbackSchema), async (c) => {
  const { repoId, feedback, email, source } = c.req.valid('json');

  // Sanitize feedback content
  const safeFeedback = sanitizeHtml(feedback);

  // Log feedback
  logger.info(`Feedback received`, { repoId, feedback: safeFeedback, email });

  // Send to Discord if configured
  if (process.env.DISCORD_FEEDBACK_WEBHOOK_URL) {
    try {
      await fetch(process.env.DISCORD_FEEDBACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `**New Feedback** 📝\n**Repo ID:** \`${repoId}\`\n**Message:** ${safeFeedback}\n**Contact:** ${email || 'Anonymous'}\n**Source:** ${source || 'widget'}`,
        }),
      });
    } catch (err) {
      logger.error('Failed to send feedback to Discord', { error: err });
    }
  }

  // TODO: Persist to DB in the future
  return c.json({ success: true });
});

/**
 * GET /:slug
 * @description Get public repository details and recent releases.
 * @param {string} slug - Repository slug or full name.
 * @returns {object} Public repo details and releases.
 * @throws 404 if not found.
 */
publicChangelog.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  
  const repo = await prisma.repo.findFirst({
    where: {
      OR: [
        { slug },
        { fullName: slug.replace('-', '/') }, // Fallback to fullName
      ],
      isPublic: true,
    },
    select: {
      id: true,
      name: true,
      fullName: true,
      description: true,
      slug: true,
      publicTitle: true,
      publicDescription: true,
      publicLogoUrl: true,
      publicAccentColor: true,
      hidePoweredBy: true,
      user: {
        select: {
          subscriptionTier: true,
        },
      },
      releases: {
        where: { publishedAt: { not: null } },
        orderBy: { publishedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          tagName: true,
          name: true,
          publishedAt: true,
          notes: {
            select: {
              id: true,
              customer: true,
              developer: true,
              stakeholder: true,
            },
          },
        },
      },
    },
  });

  if (!repo) {
    return c.json({ error: 'Changelog not found' }, 404);
  }

  // Only Team users can hide branding
  const canHideBranding = repo.user.subscriptionTier === 'TEAM';

  return c.json({
    id: repo.id,
    name: repo.publicTitle || repo.name,
    fullName: repo.fullName,
    description: repo.publicDescription || repo.description,
    logoUrl: repo.publicLogoUrl,
    accentColor: repo.publicAccentColor,
    showPoweredBy: !canHideBranding || !repo.hidePoweredBy,
    releases: repo.releases.map((r: any) => ({
      id: r.id,
      version: r.tagName,
      name: r.name,
      date: r.publishedAt,
      notes: r.notes ? {
        customer: r.notes.customer,
        developer: r.notes.developer,
        stakeholder: r.notes.stakeholder,
      } : null,
    })),
  });
});

const listReleasesSchema = z.object({
  page: z.string().optional().transform(v => Math.max(1, parseInt(v || '1'))),
  limit: z.string().optional().transform(v => Math.min(50, Math.max(1, parseInt(v || '20')))),
});

/**
 * GET /:slug/releases
 * @description Get paginated releases for a repository.
 */
publicChangelog.get('/:slug/releases', zValidator('query', listReleasesSchema), async (c) => {
  const slug = c.req.param('slug');
  const { page, limit } = c.req.valid('query');

  const repo = await prisma.repo.findFirst({
    where: {
      OR: [{ slug }, { fullName: slug.replace('-', '/') }],
      isPublic: true,
    },
    select: { id: true },
  });

  if (!repo) {
    return c.json({ error: 'Changelog not found' }, 404);
  }

  const [releases, total] = await Promise.all([
    prisma.release.findMany({
      where: { repoId: repo.id, publishedAt: { not: null } },
      orderBy: { publishedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        tagName: true,
        name: true,
        publishedAt: true,
      },
    }),
    prisma.release.count({ where: { repoId: repo.id, publishedAt: { not: null } } }),
  ]);

  return c.json({
    releases: releases.map((r: any) => ({
      id: r.id,
      version: r.tagName,
      name: r.name,
      date: r.publishedAt,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/**
 * GET /:slug/releases/:version
 * @description Get a specific release by version tag.
 * @param {string} slug - Repository slug.
 * @param {string} version - Release tag name (e.g., v1.0.0).
 * @returns {object} Release details.
 * @throws 404 if release not found.
 */
publicChangelog.get('/:slug/releases/:version', async (c) => {
  const slug = c.req.param('slug');
  const version = c.req.param('version');

  const repo = await prisma.repo.findFirst({
    where: {
      OR: [{ slug }, { fullName: slug.replace('-', '/') }],
      isPublic: true,
    },
    select: { id: true, name: true, publicTitle: true },
  });

  if (!repo) {
    return c.json({ error: 'Changelog not found' }, 404);
  }

  const release = await prisma.release.findFirst({
    where: {
      repoId: repo.id,
      tagName: version,
      publishedAt: { not: null },
    },
    select: {
      id: true,
      tagName: true,
      name: true,
      body: true,
      publishedAt: true,
      notes: {
        select: {
          id: true,
          customer: true,
          developer: true,
          stakeholder: true,
        },
      },
    },
  });

  if (!release) {
    return c.json({ error: 'Release not found' }, 404);
  }

  return c.json({
    repoName: repo.publicTitle || repo.name,
    id: release.id,
    version: release.tagName,
    name: release.name,
    body: release.body,
    date: release.publishedAt,
    notes: release.notes ? {
      customer: release.notes.customer,
      developer: release.notes.developer,
      stakeholder: release.notes.stakeholder,
    } : null,
  });
});

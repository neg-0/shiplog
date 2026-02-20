import { Hono } from 'hono';
import { prisma } from '../lib/db.js';
import { logger } from '../lib/logger.js';

export const publicChangelog = new Hono();

// Submit feedback
publicChangelog.post('/feedback', async (c) => {
  const { repoId, feedback, email, source } = await c.req.json();

  if (!repoId || !feedback) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  // Log feedback
  logger.info(`Feedback received`, { repoId, feedback, email });

  // Send to Discord if configured
  if (process.env.DISCORD_FEEDBACK_WEBHOOK_URL) {
    try {
      await fetch(process.env.DISCORD_FEEDBACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `**New Feedback** 📝\n**Repo ID:** \`${repoId}\`\n**Message:** ${feedback}\n**Contact:** ${email || 'Anonymous'}\n**Source:** ${source || 'widget'}`,
        }),
      });
    } catch (err) {
      logger.error('Failed to send feedback to Discord', { error: err });
    }
  }

  // TODO: Persist to DB in the future
  return c.json({ success: true });
});

// Get public changelog for a repo by slug
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
    releases: repo.releases.map((r) => ({
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

// Get releases list (paginated)
publicChangelog.get('/:slug/releases', async (c) => {
  const slug = c.req.param('slug');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');

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
    releases: releases.map((r) => ({
      id: r.id,
      version: r.tagName,
      name: r.name,
      date: r.publishedAt,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// Get single release
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

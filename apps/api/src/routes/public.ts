import { Hono } from 'hono';
import { prisma } from '../lib/db.js';

export const publicChangelog = new Hono();

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
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          tagName: true,
          name: true,
          createdAt: true,
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
      date: r.createdAt,
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
      where: { repoId: repo.id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        tagName: true,
        name: true,
        createdAt: true,
      },
    }),
    prisma.release.count({ where: { repoId: repo.id } }),
  ]);

  return c.json({
    releases: releases.map((r) => ({
      id: r.id,
      version: r.tagName,
      name: r.name,
      date: r.createdAt,
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
    },
    select: {
      id: true,
      tagName: true,
      name: true,
      body: true,
      createdAt: true,
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
    date: release.createdAt,
    notes: release.notes ? {
      customer: release.notes.customer,
      developer: release.notes.developer,
      stakeholder: release.notes.stakeholder,
    } : null,
  });
});

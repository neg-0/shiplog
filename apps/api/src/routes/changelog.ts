import { Hono } from 'hono';
import { prisma } from '../lib/db.js';

export const changelog = new Hono();

// Public changelog for a repo
changelog.get('/:org/:repo', async (c) => {
  const org = c.req.param('org');
  const repo = c.req.param('repo');
  const fullName = `${org}/${repo}`;
  const audience = (c.req.query('audience') || 'customer').toLowerCase();
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);

  // Find the repo
  const connectedRepo = await prisma.repo.findFirst({
    where: { 
      fullName,
      status: 'ACTIVE',
    },
    select: {
      id: true,
      name: true,
      fullName: true,
      owner: true,
      description: true,
      config: {
        select: {
          productName: true,
          companyName: true,
        },
      },
    },
  });

  if (!connectedRepo) {
    return c.json({ error: 'Changelog not found' }, 404);
  }

  // Get published releases with notes
  const releases = await prisma.release.findMany({
    where: {
      repoId: connectedRepo.id,
      status: 'PUBLISHED',
    },
    include: {
      notes: true,
    },
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });

  return c.json({
    org,
    repo,
    fullName: connectedRepo.fullName,
    description: connectedRepo.description,
    productName: connectedRepo.config?.productName || connectedRepo.name,
    companyName: connectedRepo.config?.companyName || connectedRepo.owner,
    releases: releases.map(release => ({
      version: release.tagName,
      name: release.name,
      date: release.publishedAt?.toISOString().split('T')[0],
      htmlUrl: release.htmlUrl,
      notes: release.notes ? {
        customer: release.notes.customer,
        developer: release.notes.developer,
        stakeholder: release.notes.stakeholder,
      } : null,
    })),
  });
});

// Get just the list of repos with public changelogs
changelog.get('/', async (c) => {
  const repos = await prisma.repo.findMany({
    where: {
      status: 'ACTIVE',
      releases: {
        some: {
          status: 'PUBLISHED',
        },
      },
    },
    select: {
      fullName: true,
      description: true,
      _count: {
        select: { releases: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });

  return c.json({
    changelogs: repos.map(r => ({
      fullName: r.fullName,
      description: r.description,
      releaseCount: r._count.releases,
      url: `/changelog/${r.fullName}`,
    })),
  });
});

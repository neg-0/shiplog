import { Hono } from 'hono';
import { prisma } from '../lib/db.js';

/**
 * @module changelog
 * @description Public routes for viewing repository changelogs.
 */
export const changelog = new Hono();

/**
 * GET /:org/:repo
 * @description Get the public changelog for a specific repository.
 * @param {string} org - The organization/owner name.
 * @param {string} repo - The repository name.
 * @param {string} [audience=customer] - The target audience filter (customer, developer, stakeholder).
 * @param {string} [limit=20] - Number of releases to fetch.
 * @returns {object} Repository details and list of releases with notes.
 * @throws 404 if repository is not found or not active.
 */
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
      isPublic: true,
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
    releases: releases.map((release: any) => ({
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

/**
 * GET /
 * @description List all repositories with active public changelogs.
 * @returns {object} Array of repositories with changelogs.
 */
changelog.get('/', async (c) => {
  const repos = await prisma.repo.findMany({
    where: {
      status: 'ACTIVE',
      isPublic: true,
      excludeFromFeatured: false,
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
    changelogs: repos.map((r: any) => ({
      fullName: r.fullName,
      description: r.description,
      releaseCount: r._count.releases,
      url: `/changelog/${r.fullName}`,
    })),
  });
});

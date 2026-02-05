import { Hono } from 'hono';
import { prisma } from '../lib/db.js';

export const publicRoutes = new Hono();

const getRepoBySlug = async (slug: string) => {
  return prisma.repo.findFirst({
    where: {
      slug,
      status: 'ACTIVE',
      isPublic: true,
    },
    select: {
      id: true,
      name: true,
      fullName: true,
      slug: true,
      owner: true,
      description: true,
      
      // Branding
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

      config: {
        select: {
          productName: true,
          companyName: true,
          generateCustomer: true,
          generateDeveloper: true,
          generateStakeholder: true,
        },
      },
    },
  });
};

// No auth required - public endpoints
publicRoutes.get('/changelog/:slug', async (c) => {
  const slug = c.req.param('slug');
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 50);

  const repo = await getRepoBySlug(slug);

  if (!repo) {
    return c.json({ error: 'Changelog not found' }, 404);
  }

  const releases = await prisma.release.findMany({
    where: {
      repoId: repo.id,
      status: 'PUBLISHED',
    },
    include: {
      notes: true,
    },
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });

  const tier = repo.user.subscriptionTier;
  const isPaid = tier === 'PRO' || tier === 'TEAM';
  // Allow hiding if Pro/Team and flag is set
  const hidePoweredBy = repo.hidePoweredBy && isPaid;

  return c.json({
    slug: repo.slug,
    name: repo.name,
    fullName: repo.fullName,
    description: repo.description,
    
    // Config info
    productName: repo.config?.productName || repo.name,
    companyName: repo.config?.companyName || repo.owner,
    audiences: {
      customer: repo.config?.generateCustomer ?? true,
      developer: repo.config?.generateDeveloper ?? true,
      stakeholder: repo.config?.generateStakeholder ?? true,
    },

    // Branding info
    branding: {
      title: repo.publicTitle || repo.config?.productName || repo.name,
      description: repo.publicDescription || repo.description,
      logoUrl: repo.publicLogoUrl,
      accentColor: repo.publicAccentColor,
      hidePoweredBy,
      isPaid, // Useful for frontend to know if they *could* have customized it (for upsell maybe? not strictly needed)
    },

    releases: releases.map((release) => ({
      id: release.id,
      version: release.tagName,
      name: release.name,
      date: release.publishedAt?.toISOString(),
      htmlUrl: release.htmlUrl,
      notes: release.notes
        ? {
            customer: release.notes.customer,
            developer: release.notes.developer,
            stakeholder: release.notes.stakeholder,
          }
        : null,
    })),
  });
});

publicRoutes.get('/changelog/:slug/releases', async (c) => {
  const slug = c.req.param('slug');
  const limit = Math.min(parseInt(c.req.query('limit') || '10', 10), 50);
  const page = Math.max(parseInt(c.req.query('page') || '1', 10), 1);

  const repo = await getRepoBySlug(slug);

  if (!repo) {
    return c.json({ error: 'Changelog not found' }, 404);
  }

  const total = await prisma.release.count({
    where: {
      repoId: repo.id,
      status: 'PUBLISHED',
    },
  });

  const releases = await prisma.release.findMany({
    where: {
      repoId: repo.id,
      status: 'PUBLISHED',
    },
    include: {
      notes: true,
    },
    orderBy: { publishedAt: 'desc' },
    take: limit,
    skip: (page - 1) * limit,
  });

  const tier = repo.user.subscriptionTier;
  const isPaid = tier === 'PRO' || tier === 'TEAM';
  const hidePoweredBy = repo.hidePoweredBy && isPaid;

  return c.json({
    slug: repo.slug,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    branding: {
      title: repo.publicTitle || repo.config?.productName || repo.name,
      description: repo.publicDescription || repo.description,
      logoUrl: repo.publicLogoUrl,
      accentColor: repo.publicAccentColor,
      hidePoweredBy,
    },
    releases: releases.map((release) => ({
      id: release.id,
      version: release.tagName,
      name: release.name,
      date: release.publishedAt?.toISOString(),
      htmlUrl: release.htmlUrl,
      notes: release.notes
        ? {
            customer: release.notes.customer,
            developer: release.notes.developer,
            stakeholder: release.notes.stakeholder,
          }
        : null,
    })),
  });
});

publicRoutes.get('/changelog/:slug/releases/:version', async (c) => {
  const slug = c.req.param('slug');
  const version = c.req.param('version');

  const repo = await getRepoBySlug(slug);

  if (!repo) {
    return c.json({ error: 'Changelog not found' }, 404);
  }

  const release = await prisma.release.findFirst({
    where: {
      repoId: repo.id,
      tagName: version,
      status: 'PUBLISHED',
    },
    include: {
      notes: true,
    },
  });

  if (!release) {
    return c.json({ error: 'Release not found' }, 404);
  }

  const tier = repo.user.subscriptionTier;
  const isPaid = tier === 'PRO' || tier === 'TEAM';
  const hidePoweredBy = repo.hidePoweredBy && isPaid;

  return c.json({
    slug: repo.slug,
    version: release.tagName,
    name: release.name,
    date: release.publishedAt?.toISOString(),
    htmlUrl: release.htmlUrl,
    notes: release.notes
      ? {
          customer: release.notes.customer,
          developer: release.notes.developer,
          stakeholder: release.notes.stakeholder,
        }
      : null,
    repo: {
      name: repo.name,
      fullName: repo.fullName,
      description: repo.description,
      productName: repo.config?.productName || repo.name,
      companyName: repo.config?.companyName || repo.owner,
      audiences: {
        customer: repo.config?.generateCustomer ?? true,
        developer: repo.config?.generateDeveloper ?? true,
        stakeholder: repo.config?.generateStakeholder ?? true,
      },
      branding: {
        title: repo.publicTitle || repo.config?.productName || repo.name,
        description: repo.publicDescription || repo.description,
        logoUrl: repo.publicLogoUrl,
        accentColor: repo.publicAccentColor,
        hidePoweredBy,
      },
    },
  });
});

import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireAuth, decrypt } from '../lib/auth.js';
import { listUserRepos, createWebhook, deleteWebhook } from '../services/github.js';
import { importRepoHistory } from '../services/importer.js';
import { validate } from '../lib/validation.js';

export const repos = new Hono();

const API_URL = process.env.API_URL || 'http://localhost:3001';

// All routes require auth
repos.use('*', requireAuth);

// Helper for repo access (Owner or Org Member)
const repoAccess = (userId: string) => ({
  OR: [
    { userId },
    { organization: { members: { some: { userId } } } }
  ]
});

// Helper for admin/owner access check (for deletion/critical updates)
const checkRepoAdmin = async (repoId: string, userId: string) => {
  const repo = await prisma.repo.findUnique({
    where: { id: repoId },
    include: {
      organization: {
        include: {
          members: {
            where: { userId }
          }
        }
      }
    }
  });

  if (!repo) return null;

  // If personal repo, userId must match
  if (repo.userId === userId && !repo.organizationId) return repo;

  // If org repo, user must be owner/admin
  if (repo.organizationId && repo.organization?.members.length) {
    const role = repo.organization.members[0].role;
    if (role === 'OWNER' || role === 'ADMIN') return repo;
  }

  // If user is the direct owner (even if in org, usually userId is the creator/owner)
  if (repo.userId === userId) return repo;

  return null;
};

// List user's connected repos
repos.get('/', async (c) => {
  const user = c.get('user');
  
  const connectedRepos = await prisma.repo.findMany({
    where: repoAccess(user.id),
    include: {
      releases: {
        orderBy: { publishedAt: 'desc' },
        take: 1,
        select: {
          tagName: true,
          publishedAt: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return c.json({
    repos: connectedRepos.map((repo: any) => ({
      id: repo.id,
      githubId: repo.githubId,
      name: repo.name,
      fullName: repo.fullName,
      description: repo.description,
      status: repo.status,
      lastRelease: repo.releases[0]?.tagName ?? null,
      lastReleaseDate: repo.releases[0]?.publishedAt ?? null,
    })),
  });
});

// Get single repo detail
repos.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  
  const repo = await prisma.repo.findFirst({
    where: { 
      id,
      ...repoAccess(user.id),
    },
    include: {
      config: {
        include: {
          channels: true,
          emailRecipients: true,
        },
      },
      releases: {
        orderBy: { publishedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          tagName: true,
          name: true,
          publishedAt: true,
          status: true,
        },
      },
    },
  });

  if (!repo) {
    return c.json({ error: 'Repository not found' }, 404);
  }

  return c.json({
    id: repo.id,
    githubId: repo.githubId,
    name: repo.name,
    fullName: repo.fullName,
    owner: repo.owner,
    description: repo.description,
    status: repo.status,
    webhookActive: repo.webhookActive,
    isPublic: repo.isPublic,
    slug: repo.slug,
    publicTitle: repo.publicTitle,
    publicDescription: repo.publicDescription,
    publicLogoUrl: repo.publicLogoUrl,
    publicAccentColor: repo.publicAccentColor,
    hidePoweredBy: repo.hidePoweredBy,
    excludeFromFeatured: repo.excludeFromFeatured,
    config: repo.config,
    releases: repo.releases.map((r: any) => ({
      id: r.id,
      tagName: r.tagName,
      name: r.name,
      publishedAt: r.publishedAt,
      status: r.status,
    })),
  });
});

// List available GitHub repos (not yet connected)
repos.get('/github/available', async (c) => {
  const user = c.get('user');

  // Get user's access token
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { accessToken: true },
  });

  if (!dbUser?.accessToken) {
    return c.json({ error: 'No GitHub access token' }, 401);
  }

  const accessToken = await decrypt(dbUser.accessToken);
  const githubRepos = await listUserRepos(accessToken);

  // Get already connected repo IDs
  const connectedRepos = await prisma.repo.findMany({
    where: { userId: user.id }, // Currently assumes personal repos only for available list
    select: { githubId: true },
  });
  const connectedIds = new Set(connectedRepos.map((r: any) => r.githubId));

  // Filter out already connected repos
  const availableRepos = githubRepos.filter(r => !connectedIds.has(r.id));

  return c.json({
    repos: availableRepos.map(r => ({
      githubId: r.id,
      name: r.name,
      fullName: r.full_name,
      owner: r.owner,
      description: r.description,
    })),
  });
});

const connectSchema = z.object({
  githubId: z.number(),
  owner: z.string(),
  repo: z.string(),
  fullName: z.string(),
  description: z.string().optional(),
});

// Connect a new repo (create webhook)
repos.post('/connect', validate(connectSchema), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');

  // Get user's access token
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { accessToken: true, subscriptionTier: true },
  });

  if (!dbUser?.accessToken) {
    return c.json({ error: 'No GitHub access token' }, 401);
  }

  const accessToken = await decrypt(dbUser.accessToken);

  // Check if already connected (globally for this user)
  const existing = await prisma.repo.findFirst({
    where: { 
      githubId: body.githubId,
      userId: user.id,
    },
  });

  if (existing) {
    return c.json({ error: 'Repository already connected' }, 400);
  }

  const repoCount = await prisma.repo.count({
    where: { userId: user.id },
  });

  const tier = dbUser.subscriptionTier ?? 'FREE';
  const maxRepos = tier === 'FREE' ? 1 : tier === 'PRO' ? 5 : Number.POSITIVE_INFINITY;

  if (repoCount >= maxRepos) {
    const requiredTier = tier === 'FREE' ? 'PRO' : 'TEAM';
    return c.json({
      error: `Repository limit reached for ${tier} plan. Upgrade to ${requiredTier} to add more repositories.`,
      upgradeRequired: true,
      currentTier: tier,
      requiredTier,
      maxRepos: tier === 'TEAM' ? null : maxRepos,
    }, 403);
  }

  // Generate webhook secret
  const webhookSecret = crypto.randomUUID();
  const webhookUrl = `${API_URL}/webhooks/github`;

  try {
    // Create GitHub webhook
    const { id: webhookId } = await createWebhook(
      body.owner,
      body.repo,
      webhookUrl,
      webhookSecret,
      accessToken
    );

    // Store in database
    const repo = await prisma.repo.create({
      data: {
        githubId: body.githubId,
        name: body.repo,
        fullName: body.fullName,
        owner: body.owner,
        description: body.description ?? null,
        webhookId,
        webhookSecret,
        webhookActive: true,
        status: 'ACTIVE',
        userId: user.id,
      },
      include: {
        config: true,
      },
    });

    // Create default config
    await prisma.repoConfig.create({
      data: {
        repoId: repo.id,
        autoGenerate: true,
        autoPublish: false,
        generateCustomer: true,
        generateDeveloper: true,
        generateStakeholder: true,
      },
    });

    console.log(`🔗 Connected repo: ${body.fullName} (webhook ID: ${webhookId})`);

    // Trigger background import of recent history
    importRepoHistory(repo.id, accessToken).catch(err => 
      console.error(`Background import failed for ${body.fullName}:`, err)
    );

    return c.json({
      status: 'connected',
      id: repo.id,
      fullName: repo.fullName,
      webhookActive: true,
    });

  } catch (error) {
    console.error('Failed to connect repo:', error);
    
    // Still create the repo but mark webhook as failed
    const repo = await prisma.repo.create({
      data: {
        githubId: body.githubId,
        name: body.repo,
        fullName: body.fullName,
        owner: body.owner,
        description: body.description ?? null,
        webhookActive: false,
        status: 'ERROR',
        userId: user.id,
      },
    });

    return c.json({
      status: 'partial',
      id: repo.id,
      fullName: repo.fullName,
      webhookActive: false,
      error: 'Failed to create webhook - you may need to create it manually',
    }, 201);
  }
});

const configSchema = z.object({
  autoGenerate: z.boolean().optional(),
  autoPublish: z.boolean().optional(),
  generateCustomer: z.boolean().optional(),
  generateDeveloper: z.boolean().optional(),
  generateStakeholder: z.boolean().optional(),
  customerTone: z.string().optional(),
  companyName: z.string().optional(),
  productName: z.string().optional(),
});

// Update repo config
repos.patch('/:id/config', validate(configSchema), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = c.req.valid('json');

    // Verify ownership/access
    const repo = await prisma.repo.findFirst({
      where: {
        id,
        ...repoAccess(user.id),
      },
      select: { id: true },
    });

    if (!repo) {
      return c.json({ error: 'Repository not found' }, 404);
    }
    
    // Check for admin rights if modifying critical settings?
    // For config, member access is probably fine.

    const config = await prisma.repoConfig.upsert({
      where: { repoId: id },
      create: {
        repoId: id,
        ...body,
      },
      update: body,
    });

    console.log(`📝 Updated config for repo ${id}`);

    return c.json(config);
  } catch (error) {
    console.error('Failed to update repo config:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `Failed to update configuration: ${message}` }, 500);
  }
});

const settingsSchema = z.object({
  isPublic: z.boolean().optional(),
  slug: z.string().optional(),
  publicTitle: z.string().optional(),
  publicDescription: z.string().optional(),
  publicLogoUrl: z.string().url().optional(),
  publicAccentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  hidePoweredBy: z.boolean().optional(),
  excludeFromFeatured: z.boolean().optional(),
});

// Update repo settings (public changelog options)
repos.patch('/:id/settings', validate(settingsSchema), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = c.req.valid('json');

    // Verify ownership
    const repo = await prisma.repo.findFirst({
      where: {
        id,
        ...repoAccess(user.id),
      },
      select: { id: true },
    });

    if (!repo) {
      return c.json({ error: 'Repository not found' }, 404);
    }

    const updated = await prisma.repo.update({
      where: { id },
      data: body,
      select: {
        id: true,
        isPublic: true,
        slug: true,
        publicTitle: true,
        publicDescription: true,
        publicLogoUrl: true,
        publicAccentColor: true,
        hidePoweredBy: true,
        excludeFromFeatured: true,
      },
    });

    console.log(`📝 Updated settings for repo ${id}`);

    return c.json(updated);
  } catch (error) {
    console.error('Failed to update repo settings:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `Failed to update settings: ${message}` }, 500);
  }
});

const channelSchema = z.object({
  type: z.enum(['SLACK', 'DISCORD', 'WEBHOOK']),
  name: z.string(),
  webhookUrl: z.string().url(),
  audience: z.enum(['CUSTOMER', 'DEVELOPER', 'STAKEHOLDER']),
  enabled: z.boolean().optional(),
});

// Create a distribution channel
repos.post('/:id/channels', validate(channelSchema), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const repo = await prisma.repo.findFirst({
    where: {
      id,
      ...repoAccess(user.id),
    },
    include: { config: true },
  });

  if (!repo) {
    return c.json({ error: 'Repository not found' }, 404);
  }

  const config = repo.config || await prisma.repoConfig.create({
    data: { repoId: repo.id },
  });

  const channel = await prisma.channel.create({
    data: {
      configId: config.id,
      type: body.type,
      name: body.name,
      webhookUrl: body.webhookUrl,
      audience: body.audience,
      enabled: body.enabled ?? true,
    },
  });

  return c.json(channel, 201);
});

const updateChannelSchema = z.object({
  name: z.string().optional(),
  webhookUrl: z.string().url().optional(),
  audience: z.enum(['CUSTOMER', 'DEVELOPER', 'STAKEHOLDER']).optional(),
  enabled: z.boolean().optional(),
});

// Update a distribution channel
repos.patch('/:id/channels/:channelId', validate(updateChannelSchema), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const channelId = c.req.param('channelId');
  const body = c.req.valid('json');

  // Check repo access first
  const repo = await prisma.repo.findFirst({
    where: { id, ...repoAccess(user.id) },
  });

  if (!repo) {
    return c.json({ error: 'Repository not found' }, 404);
  }

  const channel = await prisma.channel.findFirst({
    where: {
      id: channelId,
      config: { repoId: id }, // We already verified repo access
    },
  });

  if (!channel) {
    return c.json({ error: 'Channel not found' }, 404);
  }

  const updated = await prisma.channel.update({
    where: { id: channelId },
    data: body,
  });

  return c.json(updated);
});

// Delete a distribution channel
repos.delete('/:id/channels/:channelId', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const channelId = c.req.param('channelId');

  const repo = await prisma.repo.findFirst({
    where: { id, ...repoAccess(user.id) },
  });

  if (!repo) {
    return c.json({ error: 'Repository not found' }, 404);
  }

  const channel = await prisma.channel.findFirst({
    where: {
      id: channelId,
      config: { repoId: id },
    },
  });

  if (!channel) {
    return c.json({ error: 'Channel not found' }, 404);
  }

  await prisma.channel.delete({
    where: { id: channelId },
  });

  return c.json({ deleted: true });
});

// Disconnect a repo (remove webhook)
repos.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  // Strict check for deletion: Only Owner or Org Admin
  const repo = await checkRepoAdmin(id, user.id);

  if (!repo) {
    return c.json({ error: 'Repository not found or unauthorized' }, 404);
  }

  // Try to delete webhook from GitHub
  if (repo.webhookId) {
    try {
      // Need access token of the repo owner (user who connected it)
      const ownerUser = await prisma.user.findUnique({
        where: { id: repo.userId },
        select: { accessToken: true },
      });

      if (ownerUser?.accessToken) {
        const accessToken = await decrypt(ownerUser.accessToken);
        await deleteWebhook(repo.owner, repo.name, repo.webhookId, accessToken);
      }
    } catch (error) {
      console.warn('Failed to delete GitHub webhook:', error);
      // Continue with deletion anyway
    }
  }

  // Delete from database (cascades to config, releases, etc.)
  await prisma.repo.delete({
    where: { id },
  });

  console.log(`🔌 Disconnected repo: ${repo.fullName}`);

  return c.json({
    status: 'disconnected',
    id,
    fullName: repo.fullName,
  });
});

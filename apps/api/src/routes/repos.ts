import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { requireAuth, decrypt } from '../lib/auth.js';
import { apiLimiter } from '../lib/rate-limit.js';
import { listUserRepos, createWebhook, deleteWebhook } from '../services/github.js';
import { importRepoHistory } from '../services/importer.js';
import {
  connectRepoSchema,
  updateRepoConfigSchema,
  updateRepoSettingsSchema,
  createChannelSchema,
  updateChannelSchema,
} from '../lib/schemas.js';

/**
 * @module repos
 * @description Routes for managing connected repositories.
 */
export const repos = new Hono();

const API_URL = process.env.API_URL || 'http://localhost:3001';

// All routes require auth
repos.use('*', requireAuth);
repos.use('*', apiLimiter);

/**
 * GET /
 * @description List all repositories connected by the authenticated user.
 * @returns {object} Array of connected repositories.
 */
repos.get('/', async (c) => {
  const user = c.get('user');
  
  const connectedRepos = await prisma.repo.findMany({
    where: { userId: user.id },
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
    repos: connectedRepos.map(repo => ({
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

/**
 * GET /:id
 * @description Get details for a specific repository including configuration and recent releases.
 * @param {string} id - Repository UUID.
 * @returns {object} Repository details.
 * @throws 404 if not found.
 */
repos.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  
  const repo = await prisma.repo.findFirst({
    where: { 
      id,
      userId: user.id,
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
    releases: repo.releases.map(r => ({
      id: r.id,
      tagName: r.tagName,
      name: r.name,
      publishedAt: r.publishedAt,
      status: r.status,
    })),
  });
});

/**
 * GET /github/available
 * @description List GitHub repositories that can be connected (not yet imported).
 * @returns {object} Array of available GitHub repositories.
 * @throws 401 if GitHub token is missing.
 */
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
    where: { userId: user.id },
    select: { githubId: true },
  });
  const connectedIds = new Set(connectedRepos.map(r => r.githubId));

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

// Connect a new repo (create webhook)
repos.post(
  '/connect',
  zValidator('json', connectRepoSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
/**
 * POST /connect
 * @description Connect a GitHub repository. Creates a webhook on GitHub and starts initial import.
 * @body {number} githubId - GitHub Repository ID.
 * @body {string} owner - Repository owner (user/org).
 * @body {string} repo - Repository name.
 * @body {string} fullName - Full name (owner/repo).
 * @body {string} [description] - Repository description.
 * @returns {object} Connected repository details.
 * @throws 403 if repository limit reached.
 * @throws 400 if already connected.
 */
repos.post('/connect', async (c) => {
  const user = c.get('user');
  const body = await c.req.json() as { 
    githubId: number;
    owner: string; 
    repo: string;
    fullName: string;
    description?: string;
  };

    // Get user's access token
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { accessToken: true, subscriptionTier: true },
  });

  if (!dbUser?.accessToken) {
    return c.json({ error: 'No GitHub access token' }, 401);
  }

  const accessToken = await decrypt(dbUser.accessToken);

  // Check if already connected
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

    logger.info(`🔗 Connected repo: ${body.fullName} (webhook ID: ${webhookId})`, {
      repoId: repo.id,
      fullName: body.fullName,
      webhookId
    });

    // Trigger background import of recent history
    importRepoHistory(repo.id, accessToken).catch(err => 
      logger.error(`Background import failed for ${body.fullName}`, {
        repoId: repo.id,
        fullName: body.fullName,
        error: err
      })
    );

    return c.json({
      status: 'connected',
      id: repo.id,
      fullName: repo.fullName,
      webhookActive: true,
    });

  } catch (error) {
    logger.error('Failed to connect repo', { error, githubId: body.githubId, fullName: body.fullName });
    
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

// Update repo config
repos.patch(
  '/:id/config',
  zValidator('json', updateRepoConfigSchema),
  async (c) => {
    try {
      const user = c.get('user');
      const id = c.req.param('id');
      const body = c.req.valid('json');
/**
 * PATCH /:id/config
 * @description Update repository configuration (AI generation settings).
 * @param {string} id - Repository UUID.
 * @body {boolean} [autoGenerate] - Enable auto-generation of notes.
 * @body {boolean} [autoPublish] - Enable auto-publishing.
 * @body {string} [customerTone] - Tone for customer notes.
 * @returns {object} Updated configuration.
 */
repos.patch('/:id/config', async (c) => {
  const id = c.req.param('id');
  try {
    const user = c.get('user');
    const body = await c.req.json() as {
      autoGenerate?: boolean;
      autoPublish?: boolean;
      generateCustomer?: boolean;
      generateDeveloper?: boolean;
      generateStakeholder?: boolean;
      customerTone?: string;
      companyName?: string;
      productName?: string;
    };

      // Verify ownership
      const repo = await prisma.repo.findFirst({
        where: { id, userId: user.id },
        select: { id: true },
      });

      if (!repo) {
        return c.json({ error: 'Repository not found' }, 404);
      }

      // Explicitly select allowed fields to prevent Prisma errors
      const {
        autoGenerate,
        autoPublish,
        generateCustomer,
        generateDeveloper,
        generateStakeholder,
        customerTone,
        companyName,
        productName,
      } = body;

      const data = {
        autoGenerate,
        autoPublish,
        generateCustomer,
        generateDeveloper,
        generateStakeholder,
        customerTone,
        companyName,
        productName,
      };

      // Remove undefined keys
      Object.keys(data).forEach(
        (key) =>
          data[key as keyof typeof data] === undefined &&
          delete data[key as keyof typeof data]
      );

      const config = await prisma.repoConfig.upsert({
        where: { repoId: id },
        create: {
          repoId: id,
          ...data,
        },
        update: data,
      });

    logger.info(`📝 Updated config for repo ${id}`, { repoId: id });

    return c.json(config);
  } catch (error) {
    logger.error('Failed to update repo config', { repoId: id, error });
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `Failed to update configuration: ${message}` }, 500);
  }
});

// Update repo settings (public changelog options)
repos.patch(
  '/:id/settings',
  zValidator('json', updateRepoSettingsSchema),
  async (c) => {
    try {
      const user = c.get('user');
      const id = c.req.param('id');
      const body = c.req.valid('json');
/**
 * PATCH /:id/settings
 * @description Update repository public changelog settings.
 * @param {string} id - Repository UUID.
 * @body {boolean} [isPublic] - Make changelog public.
 * @body {string} [slug] - Custom slug.
 * @body {string} [publicTitle] - Public title.
 * @returns {object} Updated repository settings.
 */
repos.patch('/:id/settings', async (c) => {
  const id = c.req.param('id');
  try {
    const user = c.get('user');
    const body = await c.req.json() as {
      isPublic?: boolean;
      slug?: string;
      publicTitle?: string;
      publicDescription?: string;
      publicLogoUrl?: string;
      publicAccentColor?: string;
      hidePoweredBy?: boolean;
      excludeFromFeatured?: boolean;
    };

      // Verify ownership
      const repo = await prisma.repo.findFirst({
        where: { id, userId: user.id },
        select: { id: true },
      });

      if (!repo) {
        return c.json({ error: 'Repository not found' }, 404);
      }

      // Explicitly select allowed fields
      const {
        isPublic,
        slug,
        publicTitle,
        publicDescription,
        publicLogoUrl,
        publicAccentColor,
        hidePoweredBy,
        excludeFromFeatured,
      } = body;

      const data = {
        isPublic,
        slug,
        publicTitle,
        publicDescription,
        publicLogoUrl,
        publicAccentColor,
        hidePoweredBy,
        excludeFromFeatured,
      };

      // Remove undefined keys
      Object.keys(data).forEach(
        (key) =>
          data[key as keyof typeof data] === undefined &&
          delete data[key as keyof typeof data]
      );

      const updated = await prisma.repo.update({
        where: { id },
        data: data,
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

    logger.info(`📝 Updated settings for repo ${id}`, { repoId: id });

    return c.json(updated);
  } catch (error) {
    logger.error('Failed to update repo settings', { repoId: id, error });
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `Failed to update settings: ${message}` }, 500);
  }
});

// Create a distribution channel
repos.post(
  '/:id/channels',
  zValidator('json', createChannelSchema),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = c.req.valid('json');
/**
 * POST /:id/channels
 * @description Add a distribution channel (Slack, Discord) to the repository.
 * @param {string} id - Repository UUID.
 * @body {string} type - Channel type (SLACK, DISCORD).
 * @body {string} webhookUrl - Webhook URL.
 * @body {string} audience - Target audience.
 * @returns {object} Created channel.
 */
repos.post('/:id/channels', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json() as {
    type: 'SLACK' | 'DISCORD' | 'WEBHOOK';
    name: string;
    webhookUrl: string;
    audience: 'CUSTOMER' | 'DEVELOPER' | 'STAKEHOLDER';
    enabled?: boolean;
  };

    const repo = await prisma.repo.findFirst({
    where: { id, userId: user.id },
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

// Update a distribution channel
repos.patch(
  '/:id/channels/:channelId',
  zValidator('json', updateChannelSchema),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const channelId = c.req.param('channelId');
    const body = c.req.valid('json');
/**
 * PATCH /:id/channels/:channelId
 * @description Update a distribution channel.
 * @param {string} id - Repository UUID.
 * @param {string} channelId - Channel UUID.
 * @body {boolean} [enabled] - Enable/disable channel.
 * @returns {object} Updated channel.
 */
repos.patch('/:id/channels/:channelId', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const channelId = c.req.param('channelId');
  const body = await c.req.json() as {
    name?: string;
    webhookUrl?: string;
    audience?: 'CUSTOMER' | 'DEVELOPER' | 'STAKEHOLDER';
    enabled?: boolean;
  };

    const channel = await prisma.channel.findFirst({
    where: {
      id: channelId,
      config: { repoId: id, repo: { userId: user.id } },
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

/**
 * DELETE /:id/channels/:channelId
 * @description Delete a distribution channel.
 * @param {string} id - Repository UUID.
 * @param {string} channelId - Channel UUID.
 * @returns {object} Success message.
 */
repos.delete('/:id/channels/:channelId', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const channelId = c.req.param('channelId');

  const channel = await prisma.channel.findFirst({
    where: {
      id: channelId,
      config: { repoId: id, repo: { userId: user.id } },
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

/**
 * DELETE /:id
 * @description Disconnect a repository and remove the webhook from GitHub.
 * @param {string} id - Repository UUID.
 * @returns {object} Disconnect status.
 */
repos.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const repo = await prisma.repo.findFirst({
    where: { id, userId: user.id },
  });

  if (!repo) {
    return c.json({ error: 'Repository not found' }, 404);
  }

  // Try to delete webhook from GitHub
  if (repo.webhookId) {
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { accessToken: true },
      });

      if (dbUser?.accessToken) {
        const accessToken = await decrypt(dbUser.accessToken);
        await deleteWebhook(repo.owner, repo.name, repo.webhookId, accessToken);
      }
    } catch (error) {
      logger.warn('Failed to delete GitHub webhook', { repoId: id, error });
      // Continue with deletion anyway
    }
  }

  // Delete from database (cascades to config, releases, etc.)
  await prisma.repo.delete({
    where: { id },
  });

  logger.info(`🔌 Disconnected repo: ${repo.fullName}`, { repoId: id, fullName: repo.fullName });

  return c.json({
    status: 'disconnected',
    id,
    fullName: repo.fullName,
  });
});

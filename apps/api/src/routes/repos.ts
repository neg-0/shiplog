import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { requireAuth, decrypt } from '../lib/auth.js';
import { apiLimiter } from '../lib/rate-limit.js';
import { repoEntitlements } from '../lib/entitlements.js';
import { validateWebhookUrl } from '../services/distributor.js';
import { listUserRepos, getRepository, createWebhook, deleteWebhook } from '../services/github.js';
import { importRepoHistory } from '../services/importer.js';
import { hasActiveTeamSubscription, readableRepo } from '../lib/repo-access.js';
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

const API_URL = process.env.API_URL || 'https://api.shiplog.io';

// All routes require auth
repos.use('*', requireAuth);
repos.use('*', apiLimiter);

// Helper for admin/owner access check (for deletion/critical updates)
const checkRepoAdmin = async (repoId: string, userId: string) => {
  const repo = await prisma.repo.findUnique({
    where: { id: repoId },
    include: {
      organization: {
        include: {
          owner: { select: { subscriptionTier: true, subscriptionStatus: true, stripeSubscriptionId: true } },
          members: {
            where: { userId }
          }
        }
      }
    }
  });

  if (!repo) return null;

  // Personal repositories belong to the connecting user.
  if (!repo.organizationId) return repo.userId === userId ? repo : null;

  // Organization membership, not the original connecting user ID, grants
  // management rights after a repository is moved into a team.
  if (repo.organization?.ownerId === userId) return repo;
  if (repo.organization && hasActiveTeamSubscription(repo.organization) && repo.organization.members.length) {
    const role = repo.organization.members[0].role;
    if (role === 'OWNER' || role === 'ADMIN') return repo;
  }

  return null;
};

const currentRepo = (tx: Prisma.TransactionClient, repoId: string, userId: string) =>
  tx.repo.findUnique({
    where: { id: repoId },
    include: {
      user: { select: { subscriptionTier: true } },
      config: true,
      organization: {
        include: {
          owner: { select: { subscriptionTier: true, subscriptionStatus: true, stripeSubscriptionId: true } },
          members: { where: { userId }, select: { role: true } },
        },
      },
    },
  });

type CurrentRepo = NonNullable<Awaited<ReturnType<typeof currentRepo>>>;

const canWriteRepo = (repo: CurrentRepo, userId: string): boolean => {
  if (!repo.organizationId) return repo.userId === userId;
  if (repo.organization?.ownerId === userId) return true;
  if (repo.organization && hasActiveTeamSubscription(repo.organization) &&
    ['OWNER', 'ADMIN'].includes(repo.organization.members[0]?.role ?? '')) return true;
  return false;
};

type AcceptedWebhookDeletion = Pick<CurrentRepo, 'githubId' | 'userId' | 'organizationId' | 'webhookId'>;

// The billing webhook and organization membership writes lock the same owner
// row. Keep authorization and each database mutation on one side of those
// changes; never hold this lock while calling GitHub.
const withWritableRepo = async <T>(
  repoId: string,
  userId: string,
  write: (tx: Prisma.TransactionClient, repo: CurrentRepo) => Promise<T>,
  acceptedWebhookDeletion?: AcceptedWebhookDeletion,
): Promise<T | null> => prisma.$transaction(async (tx) => {
  const target = await tx.repo.findUnique({
    where: { id: repoId },
    select: { userId: true, organization: { select: { ownerId: true } } },
  });
  if (!target) return null;

  const lockOwnerId = target.organization?.ownerId ?? target.userId;
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${lockOwnerId} FOR UPDATE`;
  const repo = await currentRepo(tx, repoId, userId);
  // If the repo moved to another owner while we waited, this is not its lock.
  if (!repo || (repo.organization?.ownerId ?? repo.userId) !== lockOwnerId) return null;
  const sameWebhook = acceptedWebhookDeletion &&
    repo.githubId === acceptedWebhookDeletion.githubId &&
    repo.userId === acceptedWebhookDeletion.userId &&
    repo.organizationId === acceptedWebhookDeletion.organizationId &&
    repo.webhookId === acceptedWebhookDeletion.webhookId;
  const currentlyWritable = canWriteRepo(repo, userId);
  // A confirmed GitHub deletion was authorized just before that network call.
  // Finish that specific disconnect even if billing or membership changed mid-call.
  if (acceptedWebhookDeletion && !sameWebhook) return null;
  if (!currentlyWritable && !sameWebhook) return null;
  return write(tx, repo);
}, { maxWait: 10_000, timeout: 35_000 });

// List user's connected repos
/**
 * GET /
 * @description List all repositories connected by the authenticated user.
 * @returns {object} Array of connected repositories.
 */
repos.get('/', async (c) => {
  const user = c.get('user');
  
  const connectedRepos = await prisma.repo.findMany({
    where: await readableRepo(user.id),
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
      ...(await readableRepo(user.id)),
    },
    include: {
      user: { select: { subscriptionTier: true } },
      organization: {
        select: {
          ownerId: true,
          subscriptionId: true,
          owner: { select: { subscriptionTier: true, subscriptionStatus: true, stripeSubscriptionId: true } },
          members: { where: { userId: user.id }, select: { role: true } },
        },
      },
      config: {
        select: {
          autoGenerate: true,
          autoPublish: true,
          generateCustomer: true,
          generateDeveloper: true,
          generateStakeholder: true,
          customerTone: true,
          companyName: true,
          productName: true,
          channels: {
            select: { id: true, type: true, name: true, audience: true, enabled: true },
          },
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
    canManage: !repo.organizationId
      ? repo.userId === user.id
      : repo.organization?.ownerId === user.id || Boolean(repo.organization && hasActiveTeamSubscription(repo.organization) && ['OWNER', 'ADMIN'].includes(repo.organization.members[0]?.role ?? '')),
    entitlements: repoEntitlements(repo),
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

  // GitHub repositories can only be connected once across accounts.
  const connectedRepos = await prisma.repo.findMany({
    where: { githubId: { in: githubRepos.map(repo => repo.id) } },
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
repos.post(
  '/connect',
  zValidator('json', connectRepoSchema),
  async (c) => {
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

    // The database permits one connection per GitHub repository.
    const existing = await prisma.repo.findFirst({
      where: { 
        githubId: body.githubId,
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

    let webhookId: number | undefined;
    try {
      const githubRepo = await getRepository(body.owner, body.repo, accessToken);
      if (githubRepo.id !== body.githubId || githubRepo.full_name.toLowerCase() !== body.fullName.toLowerCase()) {
        return c.json({ error: 'Repository details do not match GitHub. Refresh and try again.' }, 400);
      }
      // Create GitHub webhook
      ({ id: webhookId } = await createWebhook(
        githubRepo.owner.login,
        githubRepo.name,
        webhookUrl,
        webhookSecret,
        accessToken
      ));

      // Store in database
      const repo = await prisma.repo.create({
        data: {
          githubId: githubRepo.id,
          name: githubRepo.name,
          fullName: githubRepo.full_name,
          owner: githubRepo.owner.login,
          description: githubRepo.description,
          // The numeric GitHub identity keeps similarly named owner/repo pairs distinct.
          slug: `${githubRepo.owner.login}-${githubRepo.name}-${githubRepo.id}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
          isPublic: false,
          webhookId,
          webhookSecret,
          webhookActive: true,
          status: 'ACTIVE',
          userId: user.id,
          config: { create: { autoGenerate: false } },
        },
        include: {
          config: true,
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
      
      // Leave a failed connection retryable and avoid orphaned GitHub hooks.
      if (webhookId !== undefined) {
        try {
          await deleteWebhook(body.owner, body.repo, webhookId, accessToken);
        } catch (cleanupError) {
          logger.warn('Failed to clean up GitHub webhook', { githubId: body.githubId, error: cleanupError });
        }
      }
      return c.json({
        error: 'Could not connect the repository. Check GitHub admin permissions and try again.',
      }, 502);
    }
  }
);

/** Retry GitHub release discovery without regenerating notes or sending channels. */
repos.post('/:id/import', async (c) => {
  const user = c.get('user');
  const repo = await checkRepoAdmin(c.req.param('id'), user.id);
  if (!repo) return c.json({ error: 'Repository not found or unauthorized' }, 404);

  const owner = await prisma.user.findUnique({
    where: { id: repo.userId },
    select: { accessToken: true },
  });
  if (!owner?.accessToken) {
    return c.json({ error: 'The connecting GitHub account must sign in again before importing releases.' }, 409);
  }

  try {
    const accessToken = await decrypt(owner.accessToken);
    // Decryption can take time; recheck paid membership just before import.
    if (!await checkRepoAdmin(repo.id, user.id)) {
      return c.json({ error: 'Repository not found or unauthorized' }, 404);
    }
    const result = await importRepoHistory(repo.id, accessToken, { metadataOnly: true });
    return c.json({ status: 'complete', found: result.found });
  } catch (error) {
    logger.warn('GitHub history retry failed', { repoId: repo.id, error });
    return c.json({ error: 'Could not import GitHub releases. Check repository access and try again.' }, 502);
  }
});

/**
 * PATCH /:id/config
 * @description Update repository configuration (AI generation settings).
 */
repos.patch(
  '/:id/config',
  zValidator('json', updateRepoConfigSchema),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = c.req.valid('json');

    try {
      const response = await withWritableRepo(id, user.id, async (tx, repo) => {
        if ((body.autoGenerate === true || body.autoPublish === true) && !repoEntitlements(repo).automation) {
          return c.json({ error: 'Automatic generation and publishing require Pro or Team.', upgradeRequired: true }, 403);
        }

        const config = await tx.repoConfig.upsert({
          where: { repoId: id },
          create: {
            repoId: id,
            autoGenerate: false,
            ...body,
          },
          update: body,
        });
        return c.json(config);
      });
      if (!response) return c.json({ error: 'Repository not found' }, 404);
      if (response.ok) logger.info(`📝 Updated config for repo ${id}`, { repoId: id });
      return response;
    } catch (error) {
      logger.error('Failed to update repo config', { repoId: id, error });
      return c.json({ error: 'Failed to update configuration' }, 500);
    }
  }
);

/**
 * PATCH /:id/settings
 * @description Update repository public changelog settings.
 */
repos.patch(
  '/:id/settings',
  zValidator('json', updateRepoSettingsSchema),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = c.req.valid('json');

    try {
      const response = await withWritableRepo(id, user.id, async (tx, repo) => {
        if ((body.hidePoweredBy === true || body.publicLogoUrl || body.publicAccentColor) && !repoEntitlements(repo).branding) {
          return c.json({ error: 'Custom branding requires Team.', upgradeRequired: true }, 403);
        }

        const updated = await tx.repo.update({
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
        return c.json(updated);
      });
      if (!response) return c.json({ error: 'Repository not found' }, 404);
      if (response.ok) logger.info(`📝 Updated settings for repo ${id}`, { repoId: id });
      return response;
    } catch (error) {
      logger.error('Failed to update repo settings', { repoId: id, error });
      return c.json({ error: 'Failed to update settings' }, 500);
    }
  }
);

/**
 * POST /:id/channels
 * @description Add a distribution channel (Slack, Discord) to the repository.
 */
repos.post(
  '/:id/channels',
  zValidator('json', createChannelSchema),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = c.req.valid('json');

    if (body.type === 'WEBHOOK') {
      return c.json({ error: 'Generic webhooks are not supported. Choose Slack or Discord.' }, 400);
    }

    try { validateWebhookUrl(body.webhookUrl, body.type.toLowerCase() as 'slack' | 'discord'); }
    catch (error) { return c.json({ error: (error as Error).message }, 400); }

    const response = await withWritableRepo(id, user.id, async (tx, repo) => {
      if (!repoEntitlements(repo).channels) {
        return c.json({ error: 'Slack and Discord channels require Pro or Team.', upgradeRequired: true }, 403);
      }

      const config = repo.config || await tx.repoConfig.create({
        data: { repoId: repo.id, autoGenerate: false },
      });

      const channel = await tx.channel.create({
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
    return response ?? c.json({ error: 'Repository not found' }, 404);
  }
);

/**
 * PATCH /:id/channels/:channelId
 * @description Update a distribution channel.
 */
repos.patch(
  '/:id/channels/:channelId',
  zValidator('json', updateChannelSchema),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const channelId = c.req.param('channelId');
    const body = c.req.valid('json');

    const response = await withWritableRepo(id, user.id, async (tx, repo) => {
      const channel = await tx.channel.findFirst({
        where: {
          id: channelId,
          config: { repoId: id },
        },
      });
      if (!channel) return c.json({ error: 'Channel not found' }, 404);

      const disablingOnly = body.enabled === false && Object.keys(body).every(key => key === 'enabled');
      if (!disablingOnly && !repoEntitlements(repo).channels) {
        return c.json({ error: 'Slack and Discord channels require Pro or Team. You can still disable or remove this channel.', upgradeRequired: true }, 403);
      }

      if (body.webhookUrl || body.enabled === true) {
        if (channel.type !== 'SLACK' && channel.type !== 'DISCORD') return c.json({ error: 'Generic webhooks are not supported.' }, 400);
        try { validateWebhookUrl(body.webhookUrl ?? channel.webhookUrl, channel.type.toLowerCase() as 'slack' | 'discord'); }
        catch (error) { return c.json({ error: (error as Error).message }, 400); }
      }

      const updated = await tx.channel.update({
        where: { id: channelId },
        data: body,
      });
      return c.json(updated);
    });
    return response ?? c.json({ error: 'Repository not found' }, 404);
  }
);

/**
 * DELETE /:id/channels/:channelId
 * @description Delete a distribution channel.
 */
repos.delete('/:id/channels/:channelId', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const channelId = c.req.param('channelId');

  const response = await withWritableRepo(id, user.id, async (tx) => {
    const channel = await tx.channel.findFirst({
      where: {
        id: channelId,
        config: { repoId: id },
      },
    });
    if (!channel) return c.json({ error: 'Channel not found' }, 404);

    await tx.channel.delete({ where: { id: channelId } });
    return c.json({ deleted: true });
  });
  return response ?? c.json({ error: 'Repository not found' }, 404);
});

/**
 * DELETE /:id
 * @description Disconnect a repository and remove the webhook from GitHub.
 */
repos.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  // Strict check for deletion: Only Owner or Org Admin
  const repo = await checkRepoAdmin(id, user.id);

  if (!repo) {
    return c.json({ error: 'Repository not found or unauthorized' }, 404);
  }

  let acceptedWebhookDeletion: AcceptedWebhookDeletion | undefined;
  // Try to delete webhook from GitHub
  if (repo.webhookId) {
    try {
      // Need access token of the repo owner (user who connected it)
      const ownerUser = await prisma.user.findUnique({
        where: { id: repo.userId },
        select: { accessToken: true },
      });

      if (!ownerUser?.accessToken) throw new Error('Repository owner must reconnect GitHub');
      const accessToken = await decrypt(ownerUser.accessToken);
      // GitHub cannot participate in the database transaction. Recheck after
      // token work, immediately before the external deletion.
      const current = await checkRepoAdmin(id, user.id);
      if (!current || current.githubId !== repo.githubId || current.userId !== repo.userId ||
        current.organizationId !== repo.organizationId || current.webhookId !== repo.webhookId) {
        return c.json({ error: 'Repository not found or unauthorized' }, 404);
      }
      await deleteWebhook(current.owner, current.name, current.webhookId!, accessToken);
      acceptedWebhookDeletion = {
        githubId: current.githubId,
        userId: current.userId,
        organizationId: current.organizationId,
        webhookId: current.webhookId,
      };
    } catch (error) {
      logger.warn('Failed to delete GitHub webhook', { repoId: id, error });
      return c.json({ error: 'Could not remove the GitHub webhook. Reconnect GitHub or check repository admin permissions and retry.' }, 502);
    }
  }

  const response = await withWritableRepo(id, user.id, async (tx, currentRepo) => {
    await tx.repo.delete({ where: { id } });
    return currentRepo.fullName;
  }, acceptedWebhookDeletion);
  if (!response) return c.json({ error: 'Repository not found or unauthorized' }, 404);
  logger.info(`🔌 Disconnected repo: ${response}`, { repoId: id, fullName: response });
  return c.json({ status: 'disconnected', id, fullName: response });
});

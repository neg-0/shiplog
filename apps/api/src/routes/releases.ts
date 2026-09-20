import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { requireAuth, decrypt } from '../lib/auth.js';
import { apiLimiter } from '../lib/rate-limit.js';
import { fetchReleaseData } from '../services/github.js';
import { generateReleaseNotes } from '../services/generator.js';
import { publishReleaseNotes } from '../services/publisher.js';
import { sanitizeHtml } from '../lib/sanitize.js';
import { rateLimit } from '../lib/rate-limit.js';
import {
  regenerateNotesSchema,
  publishReleaseSchema,
  updateNotesSchema,
} from '../lib/schemas.js';

/**
 * @module releases
 * @description Routes for managing releases and their generated notes.
 */
export const releases = new Hono();

// Auth required for all release endpoints
releases.use('*', requireAuth);
releases.use('*', apiLimiter);

// Helper for repo access (Owner or Org Member) via release
const releaseAccess = (userId: string) => ({
  repo: {
    OR: [
      { userId },
      { organization: { members: { some: { userId } } } }
    ]
  }
});

/**
 * GET /:id
 * @description Get detailed information for a specific release, including generated notes.
 * @param {string} id - Release UUID.
 * @returns {object} Release details and generated notes.
 * @throws 404 if not found.
 * @throws 403 if user does not own the repo.
 */
releases.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  
  const release = await prisma.release.findFirst({
    where: {
      id,
      ...releaseAccess(user.id)
    },
    include: {
      notes: true,
      repo: {
        select: {
          id: true,
          fullName: true,
          userId: true,
          owner: true,
          name: true,
          config: {
            select: {
              channels: {
                select: { id: true, name: true, type: true, audience: true, enabled: true },
              },
            },
          },
        },
      },
    },
  });

  if (!release) {
    return c.json({ error: 'Release not found or unauthorized' }, 404);
  }

  return c.json({
    id: release.id,
    tagName: release.tagName,
    name: release.name,
    body: release.body,
    htmlUrl: release.htmlUrl,
    publishedAt: release.publishedAt,
    status: release.status,
    processedAt: release.processedAt,
    error: release.error?.startsWith('Delivery outcome needs review.') ? release.error : null,
    repo: {
      id: release.repo.id,
      fullName: release.repo.fullName,
      config: release.repo.config,
    },
    notes: release.notes ? {
      customer: release.notes.customer,
      developer: release.notes.developer,
      stakeholder: release.notes.stakeholder,
      customerEdited: release.notes.customerEdited,
      developerEdited: release.notes.developerEdited,
      stakeholderEdited: release.notes.stakeholderEdited,
      tokensUsed: release.notes.tokensUsed,
      model: release.notes.model,
    } : null,
  });
});

const regenerateLimitMiddleware = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,
  keyGenerator: (c) => {
    const user = c.get('user');
    return user ? `regen:${user.id}` : `regen:${c.req.header('x-forwarded-for') || 'unknown'}`;
  },
});

/**
 * POST /:id/regenerate
 * @description Trigger regeneration of release notes using AI.
 * @param {string} id - Release UUID.
 * @body {string} [tone] - Tone for customer notes (e.g., "friendly", "professional").
 * @returns {object} Status and token usage.
 * @throws 404 if not found.
 * @throws 500 if generation fails.
 */
releases.post(
  '/:id/regenerate',
  regenerateLimitMiddleware,
  zValidator("json", regenerateNotesSchema as any),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = c.req.valid('json');
    
    const release = await prisma.release.findFirst({
      where: {
        id,
        ...releaseAccess(user.id)
      },
      include: {
        repo: {
          include: {
            user: true,
            config: true,
          },
        },
      },
    });

    if (!release) {
      return c.json({ error: 'Release not found' }, 404);
    }

    if (release.status === 'PROCESSING') {
      return c.json({ error: 'Release is already being processed' }, 409);
    }
    if (release.error?.startsWith('Delivery outcome needs review.')) {
      return c.json({ error: release.error }, 409);
    }

    logger.info(`🔄 Regenerating notes for release ${id}`, { releaseId: id });

    try {
      const claimed = await prisma.release.updateMany({
        where: { id, status: release.status },
        data: { status: 'PROCESSING' },
      });
      if (!claimed.count) return c.json({ error: 'Release is already being processed' }, 409);

      // Decrypt token and fetch release data
      const accessToken = await decrypt(release.repo.user.accessToken);
      const releaseData = await fetchReleaseData(
        release.repo.owner,
        release.repo.name,
        release.tagName,
        accessToken
      );

      // Generate new notes
      const notes = await generateReleaseNotes({
        tagName: releaseData.release.tagName,
        previousTag: releaseData.previousTag ?? undefined,
        releaseBody: releaseData.release.body ?? undefined,
        commits: releaseData.commits,
        pullRequests: releaseData.pullRequests.map(pr => ({
          ...pr,
          body: pr.body ?? undefined,
        })),
        repoConfig: {
          productName: release.repo.config?.productName ?? release.repo.name,
          companyName: release.repo.config?.companyName ?? release.repo.owner,
          customerTone: (body as any).tone ?? release.repo.config?.customerTone ?? 'friendly',
        },
      });

      // Commit the replacement notes and review state together.
      await prisma.release.update({
        where: { id },
        data: {
          status: 'READY', processedAt: new Date(), error: null,
          isDraft: releaseData.release.isDraft,
          publishedAt: releaseData.release.publishedAt,
          notes: {
            upsert: {
              create: notes,
              update: {
                ...notes,
                customerEdited: false,
                developerEdited: false,
                stakeholderEdited: false,
              },
            },
          },
        },
      });

      logger.info(`✅ Regenerated notes for ${release.tagName}`, { releaseId: id, tagName: release.tagName });

      return c.json({
        id,
        status: 'ready',
        tokensUsed: notes.tokensUsed,
      });

    } catch (error) {
      logger.error('Failed to regenerate notes', { releaseId: id, error });
      
      await prisma.release.update({
        where: { id },
        data: { 
          status: ['PUBLISHED', 'PARTIAL_SUCCESS'].includes(release.status) ? release.status : 'FAILED',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      return c.json({ error: 'Failed to regenerate notes' }, 500);
    }
  }
);

/**
 * POST /:id/publish
 * @description Mark release as published and trigger distribution to channels.
 * @param {string} id - Release UUID.
 * @body {string[]} [channels] - Optional list of specific channels to publish to.
 * @returns {object} Publication status.
 * @throws 400 if no notes exist.
 */
releases.post(
  '/:id/publish',
  zValidator('json', publishReleaseSchema as any),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = c.req.valid('json');
    
    const release = await prisma.release.findFirst({
      where: {
        id,
        ...releaseAccess(user.id)
      },
      include: {
        notes: true,
        repo: {
          select: {
            userId: true,
            fullName: true,
            config: { include: { channels: true, emailRecipients: true } },
          },
        },
      },
    });

    if (!release) {
      return c.json({ error: 'Release not found' }, 404);
    }

    if (!release.notes) {
      return c.json({ error: 'No generated notes to publish' }, 400);
    }
    if (release.error?.startsWith('Delivery outcome needs review.')) {
      return c.json({ error: release.error }, 409);
    }

    if (release.isDraft || !release.publishedAt) {
      return c.json({ error: 'Publish the release on GitHub before publishing its notes' }, 400);
    }

    if (!['READY', 'PARTIAL_SUCCESS', 'PUBLISHED'].includes(release.status)) {
      return c.json({ error: 'Release is not ready to publish' }, 409);
    }

    if (body.channels?.some((id: string) => !release.repo.config?.channels.some(channel => channel.id === id && channel.enabled))) {
      return c.json({ error: 'One or more selected channels are unavailable' }, 400);
    }
    if (body.channels?.some((id: string) => release.repo.config?.channels.some(channel => channel.id === id && channel.type === 'WEBHOOK'))) {
      return c.json({ error: 'Generic webhooks are not supported. Choose Slack or Discord.' }, 400);
    }

    logger.info(`📤 Publishing release ${id} to channels`, { releaseId: id, channels: body.channels });

    // Only one request may deliver this release at a time.
    const claimed = await prisma.release.updateMany({
      where: { id, status: release.status },
      data: { status: 'PROCESSING' },
    });
    if (!claimed.count) return c.json({ error: 'Release is already being processed' }, 409);

    try {
      const result = await publishReleaseNotes({ ...release, notes: release.notes }, body.channels);
      return c.json({
        id,
        status: result.status.toLowerCase(),
        repo: release.repo.fullName,
        tagName: release.tagName,
        failedCount: result.failedCount,
        distributedTo: result.distributedTo,
      });
    } catch (error) {
      logger.error('Failed to publish release', { releaseId: id, error });
      const uncertain = error instanceof Error && error.name === 'PublicationOutcomeUnknown';
      await prisma.release.update({
        where: { id },
        data: {
          status: uncertain && release.status === 'READY' ? 'FAILED' : release.status,
          ...(uncertain ? { error: error.message } : {}),
        },
      });
      return c.json({ error: 'Failed to publish release' }, 500);
    }
  }
);

/**
 * PATCH /:id/notes
 * @description Manually edit the generated release notes.
 * @param {string} id - Release UUID.
 * @body {string} [customer] - Customer notes content.
 * @body {string} [developer] - Developer notes content.
 * @body {string} [stakeholder] - Stakeholder notes content.
 * @returns {object} Updated status.
 */
releases.patch(
  '/:id/notes',
  zValidator('json', updateNotesSchema as any),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = c.req.valid('json');
    
    const release = await prisma.release.findFirst({
      where: {
        id,
        ...releaseAccess(user.id)
      },
      include: {
        notes: true,
        repo: {
          select: { userId: true },
        },
      },
    });

    if (!release) {
      return c.json({ error: 'Release not found' }, 404);
    }

    if (!release.notes) {
      return c.json({ error: 'No generated notes to edit' }, 400);
    }

    const updateData: Record<string, string | boolean> = {};
    if (body.customer !== undefined) {
      updateData.customer = sanitizeHtml(body.customer);
      updateData.customerEdited = true;
    }
    if (body.developer !== undefined) {
      updateData.developer = sanitizeHtml(body.developer);
      updateData.developerEdited = true;
    }
    if (body.stakeholder !== undefined) {
      updateData.stakeholder = sanitizeHtml(body.stakeholder);
      updateData.stakeholderEdited = true;
    }

    await prisma.generatedNotes.update({
      where: { releaseId: id },
      data: updateData,
    });

    logger.info(`✏️ Updated notes for release ${id}`, { releaseId: id });
    
    return c.json({
      id,
      updated: true,
    });
  }
);

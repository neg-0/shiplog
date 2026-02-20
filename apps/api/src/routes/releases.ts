import { Hono } from 'hono';
import { prisma } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { requireAuth, decrypt } from '../lib/auth.js';
import { apiLimiter } from '../lib/rate-limit.js';
import { fetchReleaseData } from '../services/github.js';
import { generateReleaseNotes } from '../services/generator.js';

/**
 * @module releases
 * @description Routes for managing releases and their generated notes.
 */
export const releases = new Hono();

// Auth required for all release endpoints
releases.use('*', requireAuth);
releases.use('*', apiLimiter);

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
    where: { id },
    include: {
      notes: true,
      repo: {
        select: {
          id: true,
          fullName: true,
          userId: true,
        },
      },
    },
  });

  if (!release) {
    return c.json({ error: 'Release not found' }, 404);
  }

  // Verify ownership
  if (release.repo.userId !== user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
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
    repo: {
      id: release.repo.id,
      fullName: release.repo.fullName,
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

/**
 * POST /:id/regenerate
 * @description Trigger regeneration of release notes using AI.
 * @param {string} id - Release UUID.
 * @body {string} [tone] - Tone for customer notes (e.g., "friendly", "professional").
 * @returns {object} Status and token usage.
 * @throws 404 if not found.
 * @throws 500 if generation fails.
 */
releases.post('/:id/regenerate', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json() as { tone?: string };
  
  const release = await prisma.release.findFirst({
    where: { id },
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

  if (release.repo.userId !== user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  logger.info(`🔄 Regenerating notes for release ${id}`, { releaseId: id });

  try {
    // Update status
    await prisma.release.update({
      where: { id },
      data: { status: 'PROCESSING' },
    });

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
        customerTone: body.tone ?? release.repo.config?.customerTone ?? 'friendly',
      },
    });

    // Upsert notes
    await prisma.generatedNotes.upsert({
      where: { releaseId: id },
      create: {
        releaseId: id,
        customer: notes.customer,
        developer: notes.developer,
        stakeholder: notes.stakeholder,
        tokensUsed: notes.tokensUsed,
        model: notes.model,
      },
      update: {
        customer: notes.customer,
        developer: notes.developer,
        stakeholder: notes.stakeholder,
        tokensUsed: notes.tokensUsed,
        model: notes.model,
        customerEdited: false,
        developerEdited: false,
        stakeholderEdited: false,
      },
    });

    await prisma.release.update({
      where: { id },
      data: { status: 'READY', processedAt: new Date() },
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
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });

    return c.json({ 
      error: 'Failed to regenerate notes',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /:id/publish
 * @description Mark release as published and trigger distribution to channels.
 * @param {string} id - Release UUID.
 * @body {string[]} [channels] - Optional list of specific channels to publish to.
 * @returns {object} Publication status.
 * @throws 400 if no notes exist.
 */
releases.post('/:id/publish', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json() as { channels?: string[] };
  
  const release = await prisma.release.findFirst({
    where: { id },
    include: {
      notes: true,
      repo: {
        select: { userId: true, fullName: true },
      },
    },
  });

  if (!release) {
    return c.json({ error: 'Release not found' }, 404);
  }

  if (release.repo.userId !== user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  if (!release.notes) {
    return c.json({ error: 'No generated notes to publish' }, 400);
  }

  logger.info(`📤 Publishing release ${id} to channels`, { releaseId: id, channels: body.channels });

  // Mark as published (actual distribution to channels is Phase 2)
  await prisma.release.update({
    where: { id },
    data: { status: 'PUBLISHED' },
  });

  // Create distribution records for hosted changelog
  await prisma.distribution.createMany({
    data: [
      { releaseId: id, audience: 'CUSTOMER', hostedChangelog: true, status: 'SENT', sentAt: new Date() },
      { releaseId: id, audience: 'DEVELOPER', hostedChangelog: true, status: 'SENT', sentAt: new Date() },
      { releaseId: id, audience: 'STAKEHOLDER', hostedChangelog: true, status: 'SENT', sentAt: new Date() },
    ],
  });

  return c.json({
    id,
    status: 'published',
    repo: release.repo.fullName,
    tagName: release.tagName,
  });
});

/**
 * PATCH /:id/notes
 * @description Manually edit the generated release notes.
 * @param {string} id - Release UUID.
 * @body {string} [customer] - Customer notes content.
 * @body {string} [developer] - Developer notes content.
 * @body {string} [stakeholder] - Stakeholder notes content.
 * @returns {object} Updated status.
 */
releases.patch('/:id/notes', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json() as { 
    customer?: string; 
    developer?: string; 
    stakeholder?: string;
  };
  
  const release = await prisma.release.findFirst({
    where: { id },
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

  if (release.repo.userId !== user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  if (!release.notes) {
    return c.json({ error: 'No generated notes to edit' }, 400);
  }

  const updateData: Record<string, string | boolean> = {};
  if (body.customer !== undefined) {
    updateData.customer = body.customer;
    updateData.customerEdited = true;
  }
  if (body.developer !== undefined) {
    updateData.developer = body.developer;
    updateData.developerEdited = true;
  }
  if (body.stakeholder !== undefined) {
    updateData.stakeholder = body.stakeholder;
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
});

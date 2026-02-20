import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireAuth, decrypt } from '../lib/auth.js';
import { fetchReleaseData } from '../services/github.js';
import { generateReleaseNotes } from '../services/generator.js';
import { sanitizeHtml } from '../lib/sanitize.js';
import { validate } from '../lib/validation.js';
import { rateLimit } from '../middleware/rate-limit.js';

export const releases = new Hono();

// Auth required for all release endpoints
releases.use('*', requireAuth);

// Helper for repo access (Owner or Org Member) via release
const releaseAccess = (userId: string) => ({
  repo: {
    OR: [
      { userId },
      { organization: { members: { some: { userId } } } }
    ]
  }
});

// Get release with generated notes
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

const regenerateSchema = z.object({
  tone: z.string().optional(),
});

const regenerateLimitMiddleware = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,
  message: 'Too many regeneration requests. Please try again later.'
});

// Regenerate notes for a release
releases.post('/:id/regenerate', regenerateLimitMiddleware, validate(regenerateSchema), async (c) => {
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

  console.log(`🔄 Regenerating notes for release ${id}`);

  try {
    // Update status
    await prisma.release.update({
      where: { id },
      data: { status: 'PROCESSING' },
    });

    // Decrypt token and fetch release data
    // Note: If repo is Org repo, we might need a different token strategy.
    // Assuming for now the repo.user.accessToken is the one to use (creator/connector).
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

    console.log(`✅ Regenerated notes for ${release.tagName}`);

    return c.json({
      id,
      status: 'ready',
      tokensUsed: notes.tokensUsed,
    });

  } catch (error) {
    console.error('Failed to regenerate notes:', error);
    
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

const publishSchema = z.object({
  channels: z.array(z.string()).optional(),
});

// Manually publish/distribute a release
releases.post('/:id/publish', validate(publishSchema), async (c) => {
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
        select: { userId: true, fullName: true },
      },
    },
  });

  if (!release) {
    return c.json({ error: 'Release not found' }, 404);
  }

  if (!release.notes) {
    return c.json({ error: 'No generated notes to publish' }, 400);
  }

  console.log(`📤 Publishing release ${id} to channels:`, body.channels);

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

const notesSchema = z.object({
  customer: z.string().optional(),
  developer: z.string().optional(),
  stakeholder: z.string().optional(),
});

// Update generated notes (manual edit)
releases.patch('/:id/notes', validate(notesSchema), async (c) => {
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

  console.log(`✏️ Updated notes for release ${id}`);
  
  return c.json({
    id,
    updated: true,
  });
});

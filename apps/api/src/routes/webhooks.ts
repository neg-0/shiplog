import type { Release, GeneratedNotes } from '@prisma/client';
import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '../lib/db.js';
import { logger, setLoggerContext } from '../lib/logger.js';
import { fetchReleaseData } from '../services/github.js';
import { generateReleaseNotes } from '../services/generator.js';
import { decrypt } from '../lib/auth.js';
import { publishReleaseNotes } from '../services/publisher.js';
import { metrics } from '../lib/metrics.js';

/**
 * @module webhooks
 * @description Routes for handling external webhooks (GitHub).
 */
export const webhooks = new Hono();

/**
 * Verify GitHub webhook signature HMAC.
 * @param payload - Raw request body.
 * @param signature - Signature from header.
 * @param secret - Webhook secret.
 * @returns boolean indicating validity.
 */
function verifyGitHubSignature(payload: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;

  const hmac = createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');

  const signatureBuffer = Buffer.from(signature);
  const digestBuffer = Buffer.from(digest);

  if (signatureBuffer.length !== digestBuffer.length) {
    return false;
  }

  try {
    return timingSafeEqual(signatureBuffer, digestBuffer);
  } catch {
    return false;
  }
}

/**
 * POST /github
 * @description Handle GitHub webhooks (release events).
 * @header {string} x-hub-signature-256 - HMAC signature.
 * @header {string} x-github-event - Event type.
 * @returns {object} Processing status.
 */
webhooks.post('/github', async (c) => {
  // Get raw body for signature verification
  const body = await c.req.text();
  const signature = c.req.header('x-hub-signature-256');
  const event = c.req.header('x-github-event');

  // Verify signature presence early to prevent unnecessary processing
  if (!signature) {
    return c.json({ error: 'No signature' }, 401);
  }

  let payload: {
    action?: string;
    release?: { id: number; tag_name: string };
    repository?: { full_name: string }
  };

  try {
    payload = JSON.parse(body);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  logger.info(`📥 Received GitHub webhook: ${event}`, { event });

  // Handle release events
  if (event === 'release' && payload?.action === 'published') {
    const release = payload.release;
    const repo = payload.repository;
    if (!release || !Number.isInteger(release.id) || !release.tag_name || !repo?.full_name) {
      return c.json({ error: 'Invalid release payload' }, 400);
    }
    setLoggerContext({ repo: repo.full_name });

    logger.info(`🚀 New release: ${repo.full_name} @ ${release.tag_name}`, {
      repo: repo.full_name,
      tagName: release.tag_name
    });

    try {
      // Find the connected repository in our database
      const connectedRepo = await prisma.repo.findFirst({
        where: {
          fullName: repo.full_name,
          webhookActive: true,
        },
        include: {
          user: true,
          config: {
            include: {
              channels: true,
              emailRecipients: true,
            },
          },
        },
      });

      // Verify signature BEFORE processing any data.
      // Return identical errors for "not found" and "bad signature" to prevent information leakage.
      if (!connectedRepo || !connectedRepo.webhookSecret) {
        logger.warn(`Webhook auth failed for ${repo.full_name}: repo not found or no secret`, { repo: repo.full_name });
        return c.json({ error: 'Unauthorized' }, 401);
      }

      if (!verifyGitHubSignature(body, signature, connectedRepo.webhookSecret)) {
        logger.error(`Webhook auth failed for ${repo.full_name}: invalid signature`, { repo: repo.full_name });
        return c.json({ error: 'Unauthorized' }, 401);
      }

      if (connectedRepo.status === 'PAUSED') {
        return c.json({ status: 'ignored', reason: 'repository_paused' });
      }

      const publishSavedRelease = async (savedRelease: Release & { notes: GeneratedNotes | null }) => {
        const claimed = await prisma.release.updateMany({
          where: { id: savedRelease.id, status: savedRelease.status },
          data: { status: 'PROCESSING' },
        });
        if (!claimed.count) return c.json({ status: 'ignored', reason: 'already_processing' });

        let result;
        try {
          result = await publishReleaseNotes({
            ...savedRelease,
            notes: savedRelease.notes!,
            repo: { fullName: connectedRepo.fullName, config: connectedRepo.config },
          });
        } catch (error) {
          const uncertain = error instanceof Error && error.name === 'PublicationOutcomeUnknown';
          await prisma.release.update({
            where: { id: savedRelease.id },
            data: {
              status: uncertain && savedRelease.status === 'READY' ? 'FAILED' : savedRelease.status,
              ...(uncertain ? { error: error.message } : {}),
            },
          });
          throw error;
        }
        metrics.releasesProcessed++;
        metrics.distributionsSent += result.distributedTo;
        return c.json({
          status: 'processed', releaseStatus: result.status,
          release: release.tag_name, repo: repo.full_name, releaseId: savedRelease.id,
          tokensUsed: savedRelease.notes?.tokensUsed, distributedTo: result.distributedTo, failedCount: result.failedCount,
        });
      };

      // Check if release already exists to prevent replay attacks
      const existingRelease = await prisma.release.findUnique({
        where: { githubId: release.id },
        include: { notes: true },
      });

      if (existingRelease) {
        if (!existingRelease.error?.startsWith('Delivery outcome needs review.') &&
            existingRelease.repoId === connectedRepo.id && existingRelease.notes &&
            !existingRelease.isDraft && existingRelease.publishedAt && connectedRepo.config?.autoPublish &&
            ['READY', 'PARTIAL_SUCCESS'].includes(existingRelease.status)) {
          return await publishSavedRelease(existingRelease);
        }
        logger.warn(`Release ${release.id} already processed`, { releaseId: release.id });
        return c.json({ status: 'ignored', reason: 'already_processed' });
      }

      // Decrypt the user's GitHub token
      const accessToken = await decrypt(connectedRepo.user.accessToken);

      // Fetch detailed release data
      logger.info(`📊 Fetching release data for ${repo.full_name}...`, { repo: repo.full_name });
      const releaseData = await fetchReleaseData(
        connectedRepo.owner,
        connectedRepo.name,
        release.tag_name,
        accessToken
      );

      const releaseRecord = {
        repoId: connectedRepo.id,
        githubId: releaseData.release.id,
        tagName: releaseData.release.tagName,
        name: releaseData.release.name,
        body: releaseData.release.body,
        htmlUrl: releaseData.release.htmlUrl,
        isDraft: releaseData.release.isDraft,
        isPrerelease: releaseData.release.isPrerelease,
        publishedAt: releaseData.release.publishedAt,
      };

      if (connectedRepo.config?.autoGenerate === false) {
        const savedRelease = await prisma.release.create({
          data: { ...releaseRecord, status: 'SKIPPED' },
        });
        return c.json({ status: 'skipped', releaseId: savedRelease.id });
      }

      const start = Date.now();
      const notes = await generateReleaseNotes({
        tagName: releaseData.release.tagName,
        previousTag: releaseData.previousTag ?? undefined,
        releaseBody: releaseData.release.body ?? undefined,
        commits: releaseData.commits,
        pullRequests: releaseData.pullRequests.map(pr => ({ ...pr, body: pr.body ?? undefined })),
        repoConfig: {
          productName: connectedRepo.config?.productName ?? connectedRepo.name,
          companyName: connectedRepo.config?.companyName ?? connectedRepo.owner,
          customerTone: connectedRepo.config?.customerTone ?? 'friendly',
        },
      });
      metrics.generationTimeTotal += Date.now() - start;
      metrics.generationCount++;

      // Save the release and its notes atomically so retries cannot find a release without notes.
      const savedRelease = await prisma.release.create({
        data: {
          ...releaseRecord,
          status: 'READY',
          processedAt: new Date(),
          notes: { create: notes },
        },
        include: { notes: true },
      });

      if (!connectedRepo.config?.autoPublish || savedRelease.isDraft || !savedRelease.publishedAt) {
        metrics.releasesProcessed++;
        return c.json({
          status: 'processed', releaseStatus: 'READY', releaseId: savedRelease.id,
          release: release.tag_name, repo: repo.full_name, tokensUsed: notes.tokensUsed, distributedTo: 0,
        });
      }

      return await publishSavedRelease(savedRelease);

    } catch (error) {
      metrics.errorCounts++;
      logger.error('Error processing release', { error });
      return c.json({
        status: 'error',
        message: 'Failed to process release'
      }, 500);
    }
  }

  // Acknowledge other events
  return c.json({ status: 'ignored', event });
});

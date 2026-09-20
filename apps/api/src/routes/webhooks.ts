import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '../lib/db.js';
import { logger, setLoggerContext } from '../lib/logger.js';
import { fetchReleaseData } from '../services/github.js';
import { generateReleaseNotes } from '../services/generator.js';
import { decrypt } from '../lib/auth.js';
import { publishReleaseNotes } from '../services/publisher.js';
import { claimProcessing, failProcessing, needsDeliveryReview, processingWhere, recoverInterruptedProcessing } from '../services/release-processing.js';
import { metrics } from '../lib/metrics.js';
import { canUsePaidFeatures } from '../lib/entitlements.js';

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
    release?: { id: number; tag_name: string; name?: string; body?: string; html_url?: string; draft?: boolean; prerelease?: boolean; published_at?: string };
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

      const paid = canUsePaidFeatures(connectedRepo);
      const autoGenerate = connectedRepo.config?.autoGenerate === true && paid;
      const publishedAt = release.published_at ? new Date(release.published_at) : null;
      if (publishedAt && Number.isNaN(publishedAt.getTime())) {
        return c.json({ error: 'Invalid release date' }, 400);
      }

      // Persist signed metadata before acknowledging GitHub. If the process stops before
      // generation, PENDING remains visible and can be retried from the release page.
      let savedRelease = await prisma.release.upsert({
        where: { githubId: release.id },
        create: {
          repoId: connectedRepo.id, githubId: release.id, tagName: release.tag_name,
          name: release.name ?? null, body: release.body ?? null,
          htmlUrl: release.html_url ?? `https://github.com/${connectedRepo.fullName}/releases/tag/${encodeURIComponent(release.tag_name)}`,
          isDraft: release.draft ?? false, isPrerelease: release.prerelease ?? false,
          publishedAt, status: autoGenerate ? 'PENDING' : 'SKIPPED',
        },
        update: {},
        include: { notes: true },
      });
      savedRelease = await recoverInterruptedProcessing(savedRelease);
      if (savedRelease.repoId !== connectedRepo.id || needsDeliveryReview(savedRelease.error)) {
        return c.json({ status: 'ignored', reason: 'already_processed' });
      }

      const shouldGenerate = autoGenerate && !savedRelease.notes &&
        ['PENDING', 'FAILED'].includes(savedRelease.status);
      const shouldPublish = paid && connectedRepo.config?.autoPublish === true &&
        savedRelease.notes && !savedRelease.isDraft && savedRelease.publishedAt &&
        ['READY', 'PARTIAL_SUCCESS'].includes(savedRelease.status);
      if (!shouldGenerate && !shouldPublish) {
        return c.json(savedRelease.status === 'SKIPPED'
          ? { status: 'skipped', releaseId: savedRelease.id }
          : { status: 'ignored', reason: 'already_processed' });
      }

      const processRelease = async () => {
        let readyRelease = savedRelease;
        if (shouldGenerate) {
          const marker = await claimProcessing(savedRelease, 'generation');
          if (!marker) return;
          try {
            const accessToken = await decrypt(connectedRepo.user.accessToken);
            const releaseData = await fetchReleaseData(
              connectedRepo.owner, connectedRepo.name, savedRelease.tagName, accessToken
            );
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
            readyRelease = await prisma.release.update({
              where: processingWhere(savedRelease.id, marker),
              data: {
                status: 'READY', error: null, processedAt: new Date(),
                name: releaseData.release.name, body: releaseData.release.body,
                htmlUrl: releaseData.release.htmlUrl,
                isDraft: releaseData.release.isDraft, isPrerelease: releaseData.release.isPrerelease,
                publishedAt: releaseData.release.publishedAt,
                notes: { upsert: { create: notes, update: notes } },
              },
              include: { notes: true },
            });
          } catch (error) {
            await failProcessing(savedRelease, marker, error, 'generation');
            throw error;
          }
        }

        if (paid && connectedRepo.config?.autoPublish === true && readyRelease.notes &&
            !readyRelease.isDraft && readyRelease.publishedAt) {
          const marker = await claimProcessing(readyRelease, 'publication');
          if (!marker) return;
          try {
            const result = await publishReleaseNotes({
              ...readyRelease, notes: readyRelease.notes,
              repo: { fullName: connectedRepo.fullName, config: connectedRepo.config },
            }, undefined, marker);
            metrics.distributionsSent += result.distributedTo;
          } catch (error) {
            await failProcessing(readyRelease, marker, error, 'publication');
            throw error;
          }
        }
        metrics.releasesProcessed++;
      };

      // Railway runs a persistent Node process. The database record, not this
      // callback, is the recovery mechanism; uncertain publication is never replayed.
      setImmediate(() => {
        void processRelease().catch(error => {
          metrics.errorCounts++;
          logger.error('Background release processing failed', { releaseId: savedRelease.id, error });
        });
      });
      return c.json({ status: 'queued', releaseId: savedRelease.id }, 202);

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

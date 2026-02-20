import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '../lib/db.js';
import { logger, setLoggerContext } from '../lib/logger.js';
import { fetchReleaseData } from '../services/github.js';
import { generateReleaseNotes } from '../services/generator.js';
import { decrypt } from '../lib/auth.js';
import { distributeReleaseWithResults, type DistributionTarget } from '../services/distributor.js';
import { logError, logInfo } from '../lib/logger.js';
import { ReleaseStatus } from '@prisma/client';

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

  logInfo(`📥 Received GitHub webhook: ${event}`);
  logger.info(`📥 Received GitHub webhook: ${event}`, { event });

  // Handle release events
  if (event === 'release' && payload.action === 'published') {
    const release = payload.release!;
    const repo = payload.repository!;
    setLoggerContext({ repo: repo.full_name });

    logInfo(`🚀 New release: ${repo.full_name} @ ${release.tag_name}`);
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

      if (!connectedRepo) {
        logInfo(`⚠️ No connected repo found for ${repo.full_name}`);
        logger.warn(`⚠️ No connected repo found for ${repo.full_name}`, { repo: repo.full_name });
        return c.json({ status: 'ignored', reason: 'repo_not_connected' });
      }

      // Verify signature using the repo's webhook secret
      if (!connectedRepo.webhookSecret) {
        logError(`⚠️ No webhook secret for repo ${repo.full_name}`);
        logger.error(`⚠️ No webhook secret for repo ${repo.full_name}`, { repo: repo.full_name });
        return c.json({ error: 'Webhook secret not configured' }, 500);
      }

      if (!verifyGitHubSignature(body, signature, connectedRepo.webhookSecret)) {
        logError(`❌ Invalid signature for ${repo.full_name}`);
        logger.error(`❌ Invalid signature for ${repo.full_name}`, { repo: repo.full_name });
        return c.json({ error: 'Invalid signature' }, 401);
      }

      // Check if release already exists to prevent replay attacks
      const existingRelease = await prisma.release.findUnique({
        where: { githubId: release.id },
      });

      if (existingRelease) {
        console.log(`⚠️ Release ${release.id} already processed.`);
        return c.json({ status: 'ignored', reason: 'already_processed' });
      }

      // Decrypt the user's GitHub token
      const accessToken = await decrypt(connectedRepo.user.accessToken);

      // Fetch detailed release data
      logInfo(`📊 Fetching release data for ${repo.full_name}...`);
      logger.info(`📊 Fetching release data for ${repo.full_name}...`, { repo: repo.full_name });
      const releaseData = await fetchReleaseData(
        connectedRepo.owner, 
        connectedRepo.name, 
        release.tag_name, 
        accessToken
      );

      // Create the release record early to track status
      // Generate AI release notes
      logger.info(`🤖 Generating release notes...`);
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
          productName: connectedRepo.config?.productName ?? connectedRepo.name,
          companyName: connectedRepo.config?.companyName ?? connectedRepo.owner,
          customerTone: connectedRepo.config?.customerTone ?? 'friendly',
        },
      });

      logger.info(`✅ Generated notes (${notes.tokensUsed} tokens used)`, { tokensUsed: notes.tokensUsed });

      // Create the release record
      const savedRelease = await prisma.release.create({
        data: {
          repoId: connectedRepo.id,
          githubId: releaseData.release.id,
          tagName: releaseData.release.tagName,
          name: releaseData.release.name,
          body: releaseData.release.body,
          htmlUrl: releaseData.release.htmlUrl,
          isDraft: releaseData.release.isDraft,
          isPrerelease: releaseData.release.isPrerelease,
          publishedAt: releaseData.release.publishedAt,
          status: 'PROCESSING',
          processedAt: new Date(),
        },
      });

      logInfo(`💾 Created release record: ${savedRelease.id}`);

      // Generate AI release notes
      logInfo(`🤖 Generating release notes...`);

      let notes;
      try {
        notes = await generateReleaseNotes({
          tagName: releaseData.release.tagName,
          previousTag: releaseData.previousTag ?? undefined,
          releaseBody: releaseData.release.body ?? undefined,
          commits: releaseData.commits,
          pullRequests: releaseData.pullRequests.map(pr => ({
            ...pr,
            body: pr.body ?? undefined,
          })),
          repoConfig: {
            productName: connectedRepo.config?.productName ?? connectedRepo.name,
            companyName: connectedRepo.config?.companyName ?? connectedRepo.owner,
            customerTone: connectedRepo.config?.customerTone ?? 'friendly',
          },
        });
      } catch (genError) {
        logError('Failed to generate release notes', { releaseId: savedRelease.id }, genError);

        await prisma.release.update({
          where: { id: savedRelease.id },
          data: {
            status: 'FAILED',
            error: genError instanceof Error ? genError.message : 'Generation failed'
          }
        });

        throw genError;
      }

      logInfo(`✅ Generated notes (${notes.tokensUsed} tokens used)`);

      // Create the generated notes
      await prisma.generatedNotes.create({
        data: {
          releaseId: savedRelease.id,
          customer: notes.customer,
          developer: notes.developer,
          stakeholder: notes.stakeholder,
          tokensUsed: notes.tokensUsed,
          model: notes.model,
        },
      });

      // Update status to READY before distribution
      await prisma.release.update({
        where: { id: savedRelease.id },
        data: { status: 'READY' }
      });
      logger.info(`💾 Saved release: ${savedRelease.id}`, { releaseId: savedRelease.id });

      const distributionTargets: Array<DistributionTarget & {
        channelId?: string;
        emailRecipientId?: string;
      }> = [];

      const config = connectedRepo.config;

      if (config?.channels?.length) {
        for (const channel of config.channels) {
          if (!channel.enabled) continue;
          if (channel.type === 'WEBHOOK') continue;

          const audience = channel.audience.toLowerCase() as DistributionTarget['audience'];
          distributionTargets.push({
            type: channel.type === 'SLACK' ? 'slack' : 'discord',
            audience,
            webhookUrl: channel.webhookUrl,
            name: channel.name,
            channelId: channel.id,
          });
        }
      }

      if (config?.emailRecipients?.length) {
        for (const recipient of config.emailRecipients) {
          if (!recipient.enabled) continue;
          const audience = recipient.audience.toLowerCase() as DistributionTarget['audience'];
          distributionTargets.push({
            type: 'email',
            audience,
            email: recipient.email,
            name: recipient.name ?? undefined,
            emailRecipientId: recipient.id,
          });
        }
      }

      (['customer', 'developer', 'stakeholder'] as const).forEach((audience) => {
        distributionTargets.push({
          type: 'hosted',
          audience,
        });
      });

      logInfo(`📤 Distributing release ${savedRelease.id} to ${distributionTargets.length} targets`);
      logger.info(`📤 Distributing release ${savedRelease.id} to ${distributionTargets.length} targets`, {
        releaseId: savedRelease.id,
        targetCount: distributionTargets.length
      });

      const releaseWithRepo = {
        ...savedRelease,
        repo: {
          fullName: connectedRepo.fullName,
        },
      };

      const distributionResults = await distributeReleaseWithResults(
        releaseWithRepo,
        notes,
        distributionTargets
      );

      await prisma.distribution.createMany({
        data: distributionResults.map((result) => ({
          releaseId: savedRelease.id,
          audience: result.target.audience.toUpperCase() as 'CUSTOMER' | 'DEVELOPER' | 'STAKEHOLDER',
          channelId: (result.target as { channelId?: string }).channelId ?? undefined,
          emailRecipientId: (result.target as { emailRecipientId?: string }).emailRecipientId ?? undefined,
          hostedChangelog: result.target.type === 'hosted',
          status: result.success ? 'SENT' : 'FAILED',
          sentAt: result.success ? new Date() : undefined,
          error: result.success ? undefined : result.error,
          responseCode: result.responseCode,
          responseBody: result.success ? undefined : result.error,
        })),
      });

      const failedCount = distributionResults.filter(r => !r.success).length;
      const totalCount = distributionResults.length;

      let finalStatus: ReleaseStatus = 'PUBLISHED';
      let errorMsg = null;

      if (failedCount === totalCount && totalCount > 0) {
        finalStatus = 'FAILED';
        errorMsg = 'All distributions failed';
      } else if (failedCount > 0) {
        finalStatus = 'PARTIAL_SUCCESS';
        errorMsg = `${failedCount}/${totalCount} distributions failed`;
      }

      await prisma.release.update({
        where: { id: savedRelease.id },
        data: {
          status: finalStatus,
          error: errorMsg
        },
      });

      return c.json({
        status: finalStatus === 'FAILED' ? 'error' : finalStatus,
        release: release.tag_name,
        repo: repo.full_name,
        releaseId: savedRelease.id,
        tokensUsed: notes.tokensUsed,
        distributedTo: totalCount - failedCount,
        failedDistributions: failedCount
      });

    } catch (error) {
      logError('❌ Error processing release:', {}, error);
      logger.error('❌ Error processing release', { error });
      return c.json({ 
        status: 'error', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      }, 500);
    }
  }

  // Acknowledge other events
  return c.json({ status: 'ignored', event });
});

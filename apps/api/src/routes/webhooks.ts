import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '../lib/db.js';
import { fetchReleaseData } from '../services/github.js';
import { generateReleaseNotes } from '../services/generator.js';
import { decrypt } from '../lib/auth.js';
import { distributeReleaseWithResults, type DistributionTarget } from '../services/distributor.js';

export const webhooks = new Hono();

// Verify GitHub webhook signature
function verifyGitHubSignature(payload: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  
  const hmac = createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch {
    return false;
  }
}

webhooks.post('/github', async (c) => {
  // Get raw body for signature verification
  const body = await c.req.text();
  const signature = c.req.header('x-hub-signature-256');
  const event = c.req.header('x-github-event');

  // Early return for non-release events to avoid unnecessary DB lookups and parsing
  if (event !== 'release') {
    return c.json({ status: 'ignored', event });
  }

  let payload: { action?: string; release?: { tag_name: string }; repository?: { full_name: string } };
  try {
    payload = JSON.parse(body);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  // Handle release events
  if (payload.action === 'published') {
    const release = payload.release!;
    const repo = payload.repository!;

    try {
      // Find the connected repository in our database
      // NOTE: Signature verification happens after the DB lookup because each repo has
      // its own webhook secret. This is a known trade-off — we must identify the repo
      // first to retrieve the correct secret for verification.
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
        return c.json({ status: 'ignored', reason: 'repo_not_connected' });
      }

      // Verify signature using the repo's webhook secret
      if (!connectedRepo.webhookSecret) {
        console.error(`No webhook secret for repo ${repo.full_name}`);
        return c.json({ error: 'Webhook secret not configured' }, 500);
      }

      if (!verifyGitHubSignature(body, signature, connectedRepo.webhookSecret)) {
        console.error(`Invalid signature for ${repo.full_name}`);
        return c.json({ error: 'Invalid signature' }, 401);
      }

      // Decrypt the user's GitHub token
      const accessToken = await decrypt(connectedRepo.user.accessToken);

      // Fetch detailed release data
      const releaseData = await fetchReleaseData(
        connectedRepo.owner, 
        connectedRepo.name, 
        release.tag_name, 
        accessToken
      );

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
          status: 'READY',
          processedAt: new Date(),
        },
      });

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

      await prisma.release.update({
        where: { id: savedRelease.id },
        data: { status: 'PUBLISHED' },
      });

      return c.json({
        status: 'processed',
        release: release.tag_name,
        repo: repo.full_name,
        releaseId: savedRelease.id,
        tokensUsed: notes.tokensUsed,
        distributedTo: distributionResults.length,
      });

    } catch (error) {
      console.error('Error processing release:', error);
      return c.json({ status: 'error', message: 'Failed to process release' }, 500);
    }
  }

  // Acknowledge non-published release actions
  return c.json({ status: 'ignored', event, action: payload.action });
});

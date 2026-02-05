import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '../lib/db.js';
import { fetchReleaseData } from '../services/github.js';
import { generateReleaseNotes } from '../services/generator.js';
import { decrypt } from '../lib/auth.js';

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

  let payload: { action?: string; release?: { tag_name: string }; repository?: { full_name: string } };
  try {
    payload = JSON.parse(body);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  console.log(`📥 Received GitHub webhook: ${event}`);

  // Handle release events
  if (event === 'release' && payload.action === 'published') {
    const release = payload.release!;
    const repo = payload.repository!;

    console.log(`🚀 New release: ${repo.full_name} @ ${release.tag_name}`);
    
    try {
      // Find the connected repository in our database
      const connectedRepo = await prisma.repo.findFirst({
        where: {
          fullName: repo.full_name,
          webhookActive: true,
        },
        include: {
          user: true,
          config: true,
        },
      });

      if (!connectedRepo) {
        console.log(`⚠️ No connected repo found for ${repo.full_name}`);
        return c.json({ status: 'ignored', reason: 'repo_not_connected' });
      }

      // Verify signature using the repo's webhook secret
      if (!connectedRepo.webhookSecret) {
        console.error(`⚠️ No webhook secret for repo ${repo.full_name}`);
        return c.json({ error: 'Webhook secret not configured' }, 500);
      }

      if (!verifyGitHubSignature(body, signature, connectedRepo.webhookSecret)) {
        console.error(`❌ Invalid signature for ${repo.full_name}`);
        return c.json({ error: 'Invalid signature' }, 401);
      }

      // Decrypt the user's GitHub token
      const accessToken = await decrypt(connectedRepo.user.accessToken);

      // Fetch detailed release data
      console.log(`📊 Fetching release data for ${repo.full_name}...`);
      const releaseData = await fetchReleaseData(
        connectedRepo.owner, 
        connectedRepo.name, 
        release.tag_name, 
        accessToken
      );

      // Generate AI release notes
      console.log(`🤖 Generating release notes...`);
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

      console.log(`✅ Generated notes (${notes.tokensUsed} tokens used)`);

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

      console.log(`💾 Saved release: ${savedRelease.id}`);

      // TODO: Distribute to configured channels (Slack, Discord, Email, etc.)
      // This would be Phase 2 functionality

      return c.json({
        status: 'processed',
        release: release.tag_name,
        repo: repo.full_name,
        releaseId: savedRelease.id,
        tokensUsed: notes.tokensUsed,
      });

    } catch (error) {
      console.error('❌ Error processing release:', error);
      return c.json({ 
        status: 'error', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      }, 500);
    }
  }

  // Acknowledge other events
  return c.json({ status: 'ignored', event });
});

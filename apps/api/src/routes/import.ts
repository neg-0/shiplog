import { Hono } from 'hono';
import { prisma } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { decrypt } from '../lib/auth.js';
import { fetchReleaseData, listReleases } from '../services/github.js';
import { generateReleaseNotes } from '../services/generator.js';

export const importRouter = new Hono();

// POST /import/repos/:id/backfill
importRouter.post('/repos/:id/backfill', requireAuth, async (c) => {
  const repoId = c.req.param('id');
  const user = c.get('user');
  const { limit = 10 } = await c.req.json().catch(() => ({ limit: 10 }));

  // 1. Verify access to repo
  const repo = await prisma.repo.findFirst({
    where: {
      id: repoId,
      userId: user.id,
    },
    include: {
      config: true,
    },
  });

  if (!repo) {
    return c.json({ error: 'Repository not found' }, 404);
  }

  try {
    // 2. Get access token
    const accessToken = await decrypt(repo.user.accessToken);

    // 3. List releases from GitHub
    console.log(`📥 Backfilling releases for ${repo.fullName} (limit: ${limit})`);
    const releases = await listReleases(repo.owner, repo.name, accessToken, limit + 1); // +1 for diff base

    // Process releases (newest first)
    // We reverse to process chronologically if needed, but for backfill usually we want newest first?
    // Actually, newest first is fine, but we need previous tag for diffs.
    // listReleases returns newest first.
    // releases[i] is the target release. releases[i+1] is the previous tag.

    let importedCount = 0;
    const errors: string[] = [];

    // Iterate up to 'limit' (ignoring the +1th item which is just for diff)
    for (let i = 0; i < Math.min(limit, releases.length); i++) {
      const release = releases[i];
      
      // Skip if already exists
      const existing = await prisma.release.findFirst({
        where: {
          repoId: repo.id,
          tagName: release.tag_name,
        },
      });

      if (existing) {
        console.log(`⏩ Skipping existing release: ${release.tag_name}`);
        continue;
      }

      console.log(`🔄 Importing release: ${release.tag_name}`);
      
      try {
        // Fetch full release data (commits, PRs)
        // We use the same service as webhooks to ensure consistent data quality
        const releaseData = await fetchReleaseData(
            repo.owner,
            repo.name,
            release.tag_name,
            accessToken
        );

        // Generate notes
        // TODO: Optimized path for releases with existing bodies (summarization only)
        // For now, full generation to ensure quality across audiences
        const notes = await generateReleaseNotes({
            tagName: releaseData.release.tagName,
            previousTag: releaseData.previousTag ?? undefined,
            releaseBody: releaseData.release.body ?? undefined, // Pass existing body as context
            commits: releaseData.commits,
            pullRequests: releaseData.pullRequests.map(pr => ({
              ...pr,
              body: pr.body ?? undefined,
            })),
            repoConfig: {
              productName: repo.config?.productName ?? repo.name,
              companyName: repo.config?.companyName ?? repo.owner,
              customerTone: repo.config?.customerTone ?? 'friendly',
            },
        });

        // Save to DB
        const savedRelease = await prisma.release.create({
            data: {
              repoId: repo.id,
              githubId: releaseData.release.id,
              tagName: releaseData.release.tagName,
              name: releaseData.release.name,
              body: releaseData.release.body,
              htmlUrl: releaseData.release.htmlUrl,
              isDraft: releaseData.release.isDraft,
              isPrerelease: releaseData.release.isPrerelease,
              publishedAt: releaseData.release.publishedAt,
              status: 'PUBLISHED', // Imported releases are considered published locally
              processedAt: new Date(),
            },
        });

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

        // Create a 'backfill' distribution record for tracking
        await prisma.distribution.create({
            data: {
              releaseId: savedRelease.id,
              audience: 'CUSTOMER', // Default dummy audience
              status: 'SENT',
              sentAt: new Date(),
              responseBody: 'Imported via backfill',
              hostedChangelog: true,
            },
        });

        importedCount++;
      } catch (err) {
        console.error(`❌ Failed to import ${release.tag_name}:`, err);
        errors.push(`${release.tag_name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return c.json({
      status: 'completed',
      imported: importedCount,
      totalFound: releases.length,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    console.error('❌ Backfill failed:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Backfill failed' }, 500);
  }
});

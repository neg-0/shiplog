import { prisma } from '../lib/db.js';
import { listReleases, fetchReleaseData } from './github.js';
import { generateReleaseNotes } from './generator.js';

export async function importRepoHistory(repoId: string, accessToken: string) {
  try {
    const repo = await prisma.repo.findUnique({
      where: { id: repoId },
      include: { config: true },
    });

    if (!repo) {
      console.error(`Repo ${repoId} not found`);
      return;
    }

    console.log(`📥 Starting import for ${repo.fullName}...`);

    // 1. Fetch recent releases
    const releases = await listReleases(repo.owner, repo.name, accessToken, 5);

    console.log(`   Found ${releases.length} releases.`);

    // 2. Process each release (newest first)
    for (const ghRelease of releases) {
      // Check if already exists
      const existing = await prisma.release.findUnique({
        where: { githubId: ghRelease.id },
      });

      if (existing) {
        console.log(`   Skipping ${ghRelease.tag_name} (already exists)`);
        continue;
      }

      console.log(`   Importing ${ghRelease.tag_name}...`);

      // Create basic record first
      const release = await prisma.release.create({
        data: {
          repoId,
          githubId: ghRelease.id,
          tagName: ghRelease.tag_name,
          name: ghRelease.name,
          body: ghRelease.body,
          htmlUrl: ghRelease.html_url,
          isDraft: ghRelease.draft,
          isPrerelease: ghRelease.prerelease,
          // Use created_at for drafts so they have a sortable date, otherwise use published_at
          publishedAt: ghRelease.draft 
            ? new Date(ghRelease.created_at) 
            : (ghRelease.published_at ? new Date(ghRelease.published_at) : null),
          status: 'PENDING',
        },
      });

      // Try to generate notes if config allows
      if (repo.config?.autoGenerate) {
        try {
          // Update status to PROCESSING
          await prisma.release.update({
            where: { id: release.id },
            data: { status: 'PROCESSING' },
          });

          // Fetch detailed data (commits, PRs)
          const data = await fetchReleaseData(repo.owner, repo.name, ghRelease.tag_name, accessToken);
          
          // Generate notes
          const notes = await generateReleaseNotes({
            tagName: data.release.tagName,
            previousTag: data.previousTag ?? undefined,
            releaseBody: data.release.body ?? undefined,
            commits: data.commits,
            pullRequests: data.pullRequests.map(pr => ({
              ...pr,
              body: pr.body ?? undefined,
            })),
            repoConfig: {
              companyName: repo.config.companyName ?? undefined,
              productName: repo.config.productName ?? undefined,
              customerTone: repo.config.customerTone ?? undefined,
            },
          });

          // Update release with notes
          await prisma.release.update({
            where: { id: release.id },
            data: {
              status: 'READY', // Ready for review
              notes: {
                create: {
                  customer: notes.customer,
                  developer: notes.developer,
                  stakeholder: notes.stakeholder,
                  tokensUsed: notes.tokensUsed,
                  model: notes.model,
                },
              },
            },
          });
          
          console.log(`   ✅ Generated notes for ${ghRelease.tag_name}`);
        } catch (err) {
          console.error(`   ❌ Failed to generate notes for ${ghRelease.tag_name}:`, err);
          await prisma.release.update({
            where: { id: release.id },
            data: { status: 'FAILED' },
          });
        }
      } else {
        await prisma.release.update({
          where: { id: release.id },
          data: { status: 'SKIPPED' }, 
        });
      }
    }

    console.log(`🏁 Import complete for ${repo.fullName}`);
  } catch (error) {
    console.error(`Import failed for repo ${repoId}:`, error);
  }
}

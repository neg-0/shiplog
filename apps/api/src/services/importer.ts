import { prisma } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { listReleases, fetchReleaseData } from './github.js';
import { generateReleaseNotes } from './generator.js';

/**
 * Import release history for a repository and generate notes if configured.
 *
 * @description
 * This function performs the following operations:
 * 1. Fetches the repository configuration from the database.
 * 2. Fetches the 5 most recent releases from GitHub.
 * 3. Iterates through the releases and:
 *    - Upserts the release record (race-condition safe).
 *    - If `autoGenerate` is enabled, triggers the release notes generation process.
 *    - Updates the release status to `READY`, `FAILED`, or `SKIPPED`.
 *
 * @param repoId - The UUID of the repository in the database.
 * @param accessToken - GitHub OAuth access token with repo scope.
 * @returns A promise that resolves when the import process is complete.
 */
export async function importRepoHistory(repoId: string, accessToken: string): Promise<void> {
  try {
    const repo = await prisma.repo.findUnique({
      where: { id: repoId },
      include: { config: true },
    });

    if (!repo) {
      logger.error(`Repo ${repoId} not found`, { repoId });
      return;
    }

    logger.info(`Starting import for ${repo.fullName}`, { repoId, repo: repo.fullName });

    let releases;
    try {
      releases = await listReleases(repo.owner, repo.name, accessToken, 5);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('401')) {
        logger.warn('GitHub token expired or revoked', { repoId });
        throw new Error(`GitHub authentication failed for repo ${repoId}: token expired or revoked`);
      }
      throw err;
    }

    logger.info(`Found ${releases.length} releases`, { repoId, count: releases.length });

    for (const ghRelease of releases) {
      const release = await prisma.release.upsert({
        where: { githubId: ghRelease.id },
        create: {
          repoId,
          githubId: ghRelease.id,
          tagName: ghRelease.tag_name,
          name: ghRelease.name,
          body: ghRelease.body,
          htmlUrl: ghRelease.html_url,
          isDraft: ghRelease.draft,
          isPrerelease: ghRelease.prerelease,
          publishedAt: ghRelease.draft
            ? new Date(ghRelease.created_at)
            : (ghRelease.published_at ? new Date(ghRelease.published_at) : null),
          status: 'PENDING',
        },
        update: {},
      });

      // If the release already existed (not PENDING), skip processing
      if (release.status !== 'PENDING') {
        logger.info(`Skipping ${ghRelease.tag_name} (already processed)`, { repoId, tagName: ghRelease.tag_name });
        continue;
      }

      logger.info(`Importing ${ghRelease.tag_name}`, { repoId, tagName: ghRelease.tag_name });

      if (repo.config?.autoGenerate) {
        try {
          await prisma.release.update({
            where: { id: release.id },
            data: { status: 'PROCESSING' },
          });

          const data = await fetchReleaseData(repo.owner, repo.name, ghRelease.tag_name, accessToken);

          const notes = await generateReleaseNotes({
            tagName: data.release.tagName,
            previousTag: data.previousTag ?? undefined,
            releaseBody: data.release.body ?? undefined,
            commits: data.commits,
            pullRequests: data.pullRequests.map((pr) => ({
              ...pr,
              body: pr.body ?? undefined,
            })),
            repoConfig: {
              companyName: repo.config.companyName ?? undefined,
              productName: repo.config.productName ?? undefined,
              customerTone: repo.config.customerTone ?? undefined,
            },
          });

          await prisma.release.update({
            where: { id: release.id },
            data: {
              status: 'READY',
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

          logger.info(`Generated notes for ${ghRelease.tag_name}`, { repoId, tagName: ghRelease.tag_name });
        } catch (err) {
          logger.error(`Failed to generate notes for ${ghRelease.tag_name}`, { repoId, tagName: ghRelease.tag_name, error: err });
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

    logger.info(`Import complete for ${repo.fullName}`, { repoId, repo: repo.fullName });
  } catch (error) {
    logger.error(`Import failed for repo ${repoId}`, { repoId, error });
  }
}

import { PrismaClient } from '@prisma/client';
import { fetchReleaseData, listReleases } from '../src/services/github.js';
import { generateReleaseNotes } from '../src/services/generator.js';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

async function main() {
  const repoUrl = process.argv[2];
  if (!repoUrl) {
    console.error('Usage: tsx scripts/generate-preview.ts <repo-url>');
    process.exit(1);
  }

  // Extract owner/repo
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) {
    console.error('Invalid GitHub URL');
    process.exit(1);
  }

  const owner = match[1];
  const repo = match[2].replace(/\.git$/, '');
  const slug = `${owner}-${repo}`.toLowerCase();

  console.log(`Generating preview for ${owner}/${repo}...`);

  // Get GitHub token
  let token = process.env.GITHUB_TOKEN;
  if (!token) {
    try {
      token = execSync('gh auth token').toString().trim();
    } catch (e) {
      console.error('GitHub token not found. Please set GITHUB_TOKEN or login with gh.');
      process.exit(1);
    }
  }

  // 1. Fetch latest release
  console.log('Fetching release data...');
  const releases = await fetchReleaseData(owner, repo, 'latest', token).catch(async () => {
    // If 'latest' fails (maybe no releases), try getting the most recent tag
    console.log('No "latest" release found, trying tags...');
    // This logic isn't in fetchReleaseData directly, but let's assume 'latest' works for now or fallback
    // Actually fetchReleaseData takes a tagName. I can list releases first.
    return null;
  });

  // If fetchReleaseData fails with 'latest', we might need to list releases first
  // The service has listReleases
  const releaseList = await listReleases(owner, repo, token, 1);
  
  if (releaseList.length === 0) {
    console.error('No releases found for this repo.');
    process.exit(1);
  }
  
  const latestTag = releaseList[0].tag_name;
  console.log(`Found release: ${latestTag}`);
  
  const releaseData = await fetchReleaseData(owner, repo, latestTag, token);

  // 2. Generate notes
  console.log('Generating changelog with AI...');
  const notes = await generateReleaseNotes({
    tagName: releaseData.release.tagName,
    previousTag: releaseData.previousTag || undefined,
    releaseBody: releaseData.release.body || undefined,
    commits: releaseData.commits,
    pullRequests: releaseData.pullRequests,
    repoConfig: {
      companyName: owner,
      productName: repo,
      customerTone: 'exciting', // Marketing tone
    },
  });

  // 3. Save to DB
  console.log('Saving to database...');
  
  const body = JSON.stringify({
    customer: notes.customer,
    developer: notes.developer,
    stakeholder: notes.stakeholder,
    meta: {
      model: notes.model,
      tokens: notes.tokensUsed,
      version: releaseData.release.tagName,
      date: releaseData.release.publishedAt,
    }
  });

  const record = await prisma.preGenChangelog.upsert({
    where: { slug },
    update: {
      repoUrl,
      repoOwner: owner,
      repoName: repo,
      title: `Changelog for ${repo} ${latestTag}`,
      body,
    },
    create: {
      repoUrl,
      repoOwner: owner,
      repoName: repo,
      slug,
      title: `Changelog for ${repo} ${latestTag}`,
      body,
    },
  });

  console.log(`✅ Preview generated!`);
  console.log(`ID: ${record.id}`);
  console.log(`URL: https://shiplog.io/preview/${slug}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

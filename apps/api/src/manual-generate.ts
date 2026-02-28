import { prisma } from './lib/db.js';
import { importRepoHistory } from './services/importer.js';
import { execSync } from 'child_process';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: tsx src/manual-generate.ts owner/repo');
  process.exit(1);
}

const fullName = args[0];
const [owner, name] = fullName!.split('/');

async function main() {
  let token = process.env.GITHUB_TOKEN;
  if (!token) {
    try {
      // Safe: hardcoded command with no user input
      token = execSync('gh auth token').toString().trim();
    } catch (e) {
      console.error('No GITHUB_TOKEN and gh CLI failed.');
      process.exit(1);
    }
  }

  console.log(`Processing ${fullName}...`);

  // Ensure user exists (or create dummy)
  let user = await prisma.user.findFirst();
  if (!user) {
    console.log('Creating dummy user...');
    try {
      user = await prisma.user.create({
        data: {
          githubId: 0,
          login: 'admin',
          name: 'Admin',
          email: 'admin@shiplog.io',
          accessToken: 'placeholder',
          subscriptionTier: 'PRO',
        },
      });
    } catch (e) {
      // If fails, maybe unique constraint
      console.log('User creation failed, trying to find existing...');
      user = await prisma.user.findFirst();
    }
  }

  if (!user) {
    console.error('Failed to find or create user.');
    process.exit(1);
  }

  // Ensure repo exists
  let repo = await prisma.repo.findFirst({
    where: { fullName },
  });

  if (!repo) {
    console.log(`Repo not found, creating...`);
    try {
      repo = await prisma.repo.create({
        data: {
          userId: user.id,
          githubId: 0,
          owner,
          name,
          fullName,
          slug: name,
          defaultBranch: 'main',
          config: {
            create: {
              autoGenerate: true,
              customerTone: 'excited',
            },
          },
        },
      });
    } catch (e) {
      console.error('Repo creation failed:', e);
      process.exit(1);
    }
  } else {
    // Ensure auto-generate is on
    try {
       await prisma.repoConfig.upsert({
         where: { repoId: repo.id },
         create: { repoId: repo.id, autoGenerate: true },
         update: { autoGenerate: true },
       });
    } catch (e) {
      console.error('Repo config update failed:', e);
    }
  }

  console.log(`Repo ID: ${repo.id}`);
  await importRepoHistory(repo.id, token);
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

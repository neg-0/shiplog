import { Hono } from 'hono';
import { prisma } from '../lib/db.js';
import { signToken } from '../lib/jwt.js';
import { encrypt } from '../lib/auth.js';
import { listReleases, fetchReleaseData } from '../services/github.js';
import { generateReleaseNotes } from '../services/generator.js';

export const auth = new Hono();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const APP_URL = process.env.APP_URL || 'https://shiplog.io';
const API_URL = process.env.API_URL || 'https://api.shiplog.io';

// In-memory state storage (valid for 10 minutes)
const pendingStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60 * 1000;

// Clean up expired states periodically
setInterval(() => {
  const now = Date.now();
  for (const [state, createdAt] of pendingStates) {
    if (now - createdAt > STATE_TTL_MS) {
      pendingStates.delete(state);
    }
  }
}, 60 * 1000);

// Initiate GitHub OAuth
auth.get('/github', (c) => {
  if (!GITHUB_CLIENT_ID) {
    return c.json({ error: 'GitHub OAuth not configured' }, 500);
  }

  const state = crypto.randomUUID();
  pendingStates.set(state, Date.now());

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: `${API_URL}/auth/github/callback`,
    scope: 'repo read:user user:email',
    state,
  });

  console.log(`🔑 OAuth initiated with state: ${state.slice(0, 8)}...`);

  return c.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// GitHub OAuth callback
auth.get('/github/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');

  console.log(`🔑 OAuth callback with state: ${state?.slice(0, 8)}...`);

  if (!code) {
    return c.json({ error: 'No code provided' }, 400);
  }

  if (!state || !pendingStates.has(state)) {
    console.log(`❌ Invalid state. Known states: ${pendingStates.size}`);
    return c.json({ error: 'Invalid OAuth state' }, 400);
  }

  // Remove used state
  pendingStates.delete(state);

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return c.json({ error: 'GitHub OAuth not configured' }, 500);
  }

  // Exchange code for access token
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const tokenData = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };

  if (tokenData.error || !tokenData.access_token) {
    return c.json({ error: 'Failed to get access token', details: tokenData.error_description }, 400);
  }

  // Get user info
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${tokenData.access_token}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!userResponse.ok) {
    return c.json({ error: 'Failed to fetch GitHub user' }, 400);
  }

  const ghUser = await userResponse.json() as {
    id: number;
    login: string;
    name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  };

  // GitHub often returns null email unless it's public. Fetch verified primary email if needed.
  let email: string | null | undefined = ghUser.email;
  if (!email) {
    const emailsResponse = await fetch('https://api.github.com/user/emails', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (emailsResponse.ok) {
      const emails = await emailsResponse.json() as Array<{ email: string; primary: boolean; verified: boolean }>;
      email = emails.find((e) => e.primary && e.verified)?.email ?? emails.find((e) => e.verified)?.email;
    }
  }

  const encryptedAccessToken = await encrypt(tokenData.access_token);

  const dbUser = await prisma.user.upsert({
    where: { githubId: ghUser.id },
    create: {
      githubId: ghUser.id,
      login: ghUser.login,
      name: ghUser.name ?? null,
      email: email ?? null,
      avatarUrl: ghUser.avatar_url ?? null,
      accessToken: encryptedAccessToken,
    },
    update: {
      login: ghUser.login,
      name: ghUser.name ?? null,
      email: email ?? null,
      avatarUrl: ghUser.avatar_url ?? null,
      accessToken: encryptedAccessToken,
    },
  });

  const sessionToken = await signToken(dbUser.id);

  const redirectUrl = new URL(`${APP_URL}/dashboard`);
  redirectUrl.searchParams.set('token', sessionToken);

  console.log(`✅ OAuth complete for ${ghUser.login}`);

  return c.redirect(redirectUrl.toString());
});

// Demo Login & Sales Tool (Internal Only)
auth.post('/demo', async (c) => {
  // 1. Stealth Check
  const demoToken = c.req.header('X-Demo-Token');
  if (!process.env.DEMO_ACCESS_TOKEN || demoToken !== process.env.DEMO_ACCESS_TOKEN) {
    // Return 401 with generic error to hide existence
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // 2. Sales Tool: Import Repo & Generate Preview
  const body = await c.req.json().catch(() => ({}));
  if (body.repoUrl || body.repo) {
    const repoString = (body.repoUrl || body.repo) as string;
    
    // Parse owner/repo
    // Supports: "owner/repo" or "https://github.com/owner/repo"
    const match = repoString.match(/github\.com\/([^\/]+)\/([^\/]+)/) || repoString.match(/^([^\/]+)\/([^\/]+)$/);
    
    if (!match) {
      return c.json({ error: 'Invalid repo format. Use "owner/repo" or full URL.' }, 400);
    }
    
    const owner = match[1];
    const repoName = match[2].replace(/\.git$/, '');
    const slug = `${owner}-${repoName}`.toLowerCase();
    
    // Check cache
    const existing = await prisma.preGenChangelog.findUnique({
      where: { slug },
    });
    
    if (existing) {
      return c.json({ 
        previewUrl: `${APP_URL}/preview/${existing.slug}`,
        status: 'existing',
        slug: existing.slug
      });
    }

    try {
      // Use system token if available (env.GITHUB_TOKEN), else unauthenticated (public only)
      const accessToken = process.env.GITHUB_TOKEN || ''; 
      
      // Fetch latest release
      const releases = await listReleases(owner, repoName, accessToken, 1);
      
      if (!releases || releases.length === 0) {
        return c.json({ error: 'No releases found for this repository' }, 404);
      }
      
      const release = releases[0];
      
      // Fetch detailed data for generation
      const data = await fetchReleaseData(owner, repoName, release.tag_name, accessToken);
      
      // Generate Content
      const notes = await generateReleaseNotes({
        tagName: data.release.tagName,
        previousTag: data.previousTag ?? undefined,
        releaseBody: data.release.body ?? undefined,
        commits: data.commits,
        pullRequests: data.pullRequests.map(pr => ({
          ...pr,
          body: pr.body ?? undefined
        })),
        repoConfig: {
          companyName: owner,
          productName: repoName,
          customerTone: 'professional',
        },
      });

      // Save Result
      const preGen = await prisma.preGenChangelog.create({
        data: {
          slug,
          repoUrl: `https://github.com/${owner}/${repoName}`,
          repoOwner: owner,
          repoName: repoName,
          title: `Changelog for ${repoName} ${release.tag_name}`,
          body: JSON.stringify(notes),
        },
      });

      return c.json({ 
        previewUrl: `${APP_URL}/preview/${preGen.slug}`,
        status: 'created',
        slug: preGen.slug
      });
      
    } catch (err: any) {
      console.error(`Sales tool error for ${owner}/${repoName}:`, err);
      const isRateLimit = err.message?.includes('403') || err.message?.includes('rate limit');
      return c.json({ 
        error: isRateLimit ? 'GitHub rate limit exceeded' : `Failed to generate: ${err.message}` 
      }, 500);
    }
  }

  // 3. Demo Login Session (if no repo provided)
  const DEMO_GITHUB_ID = -1;
  const DEMO_EMAIL = 'demo@shiplog.io';
  
  const encryptedAccessToken = await encrypt('demo-access-token');

  const dbUser = await prisma.user.upsert({
    where: { githubId: DEMO_GITHUB_ID },
    create: {
      githubId: DEMO_GITHUB_ID,
      login: 'demo-user',
      name: 'Captain Demo',
      email: DEMO_EMAIL,
      avatarUrl: 'https://github.com/ghost.png',
      accessToken: encryptedAccessToken,
      subscriptionTier: 'PRO',
    },
    update: {
      login: 'demo-user',
      accessToken: encryptedAccessToken,
      subscriptionTier: 'PRO',
    },
  });

  const sessionToken = await signToken(dbUser.id);
  
  return c.json({ token: sessionToken, user: { id: dbUser.id, login: dbUser.login } });
});

// Logout
auth.post('/logout', (c) => {
  return c.json({ status: 'logged_out' });
});

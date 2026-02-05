import { Hono } from 'hono';
import { prisma } from '../lib/db.js';
import { signToken } from '../lib/jwt.js';
import { encrypt } from '../lib/auth.js';

export const auth = new Hono();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:3001';

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

// Logout
auth.post('/logout', (c) => {
  // TODO: Invalidate session
  return c.json({ status: 'logged_out' });
});

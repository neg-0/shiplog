import type { Context } from 'hono';
import { Hono } from 'hono';
import { prisma } from '../lib/db.js';
import { signToken } from '../lib/jwt.js';
import { encrypt } from '../lib/auth.js';

export const auth = new Hono();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:3001';

const isProduction = process.env.NODE_ENV === 'production';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

function setAuthCookies(c: Context, token: string): void {
  c.header('Set-Cookie', `shiplog_session=${token}; HttpOnly; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${isProduction ? '; Secure' : ''}`, { append: true });
  c.header('Set-Cookie', `shiplog_logged_in=1; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${isProduction ? '; Secure' : ''}`, { append: true });
}

function clearAuthCookies(c: Context): void {
  c.header('Set-Cookie', `shiplog_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${isProduction ? '; Secure' : ''}`, { append: true });
  c.header('Set-Cookie', `shiplog_logged_in=; Path=/; Max-Age=0; SameSite=Lax${isProduction ? '; Secure' : ''}`, { append: true });
}

const pendingStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60 * 1000;

const pendingCodes = new Map<string, { token: string; createdAt: number }>();
const CODE_TTL_MS = 30 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [state, createdAt] of pendingStates) {
    if (now - createdAt > STATE_TTL_MS) {
      pendingStates.delete(state);
    }
  }
  for (const [code, entry] of pendingCodes) {
    if (now - entry.createdAt > CODE_TTL_MS) {
      pendingCodes.delete(code);
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

  return c.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// GitHub OAuth callback
auth.get('/github/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!code) {
    return c.json({ error: 'No code provided' }, 400);
  }

  if (!state || !pendingStates.has(state)) {
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
    return c.json({ error: 'Failed to get access token' }, 400);
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

  const exchangeCode = crypto.randomUUID();
  pendingCodes.set(exchangeCode, { token: sessionToken, createdAt: Date.now() });

  const redirectUrl = new URL(`${APP_URL}/dashboard`);
  redirectUrl.searchParams.set('code', exchangeCode);

  return c.redirect(redirectUrl.toString());
});

auth.post('/exchange', async (c) => {
  const body = await c.req.json<{ code?: string }>();

  if (!body.code) {
    return c.json({ error: 'Missing code' }, 400);
  }

  const entry = pendingCodes.get(body.code);
  if (!entry) {
    return c.json({ error: 'Invalid or expired code' }, 401);
  }

  pendingCodes.delete(body.code);
  setAuthCookies(c, entry.token);

  return c.json({ success: true });
});

auth.post('/logout', (c) => {
  clearAuthCookies(c);
  return c.json({ success: true });
});

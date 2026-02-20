import { Hono } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { prisma } from '../lib/db.js';
import { signToken } from '../lib/jwt.js';
import { encrypt, requireAuth } from '../lib/auth.js';

export const auth = new Hono();

// Initiate GitHub OAuth
auth.get('/github', (c) => {
  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  const API_URL = process.env.API_URL || 'http://localhost:3001';

  if (!GITHUB_CLIENT_ID) {
    return c.json({ error: 'GitHub OAuth not configured' }, 500);
  }

  const state = crypto.randomUUID();

  // Set secure cookie for state
  setCookie(c, 'oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  });

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
  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
  const APP_URL = process.env.APP_URL || 'http://localhost:3000';

  const code = c.req.query('code');
  const state = c.req.query('state');
  const storedState = getCookie(c, 'oauth_state');

  console.log(`🔑 OAuth callback with state: ${state?.slice(0, 8)}...`);

  if (!code) {
    return c.json({ error: 'No code provided' }, 400);
  }

  if (!state || !storedState || state !== storedState) {
    console.log(`❌ Invalid state. Received: ${state}, Stored: ${storedState}`);
    return c.json({ error: 'Invalid OAuth state' }, 400);
  }

  // Remove used state cookie
  deleteCookie(c, 'oauth_state');

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

// Demo Login (Bypass for QA/Demos)
auth.post('/demo', async (c) => {
  if (process.env.ENABLE_DEMO_LOGIN !== 'true') {
    return c.json({ error: 'Demo login disabled' }, 403);
  }

  const DEMO_GITHUB_ID = -1;
  const DEMO_EMAIL = 'demo@shiplog.io';
  
  // Encrypt a dummy token
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
      subscriptionTier: 'PRO', // Give them PRO features for demo
    },
    update: {
      login: 'demo-user', // Reset values just in case
      accessToken: encryptedAccessToken,
      subscriptionTier: 'PRO',
    },
  });

  const sessionToken = await signToken(dbUser.id);
  
  return c.json({ token: sessionToken, user: { id: dbUser.id, login: dbUser.login } });
});

// Logout
auth.post('/logout', requireAuth, async (c) => {
  const user = c.get('user');
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogoutAt: new Date() },
  });
  return c.json({ status: 'logged_out' });
});

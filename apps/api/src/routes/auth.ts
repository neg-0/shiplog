import { Hono } from 'hono';

export const auth = new Hono();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// Initiate GitHub OAuth
auth.get('/github', (c) => {
  if (!GITHUB_CLIENT_ID) {
    return c.json({ error: 'GitHub OAuth not configured' }, 500);
  }

  const state = crypto.randomUUID();
  // TODO: Store state in session/cookie for CSRF protection

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: `${APP_URL}/api/auth/callback`,
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

  // TODO: Verify state matches session

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

  const tokenData = await tokenResponse.json() as { access_token?: string; error?: string };

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

  const user = await userResponse.json() as { id: number; login: string; email: string };

  console.log(`👤 User authenticated: ${user.login}`);

  // TODO: 
  // - Create/update user in database
  // - Create session token
  // - Redirect to dashboard with token

  return c.json({
    status: 'authenticated',
    user: {
      id: user.id,
      login: user.login,
      email: user.email,
    },
  });
});

// Logout
auth.post('/logout', (c) => {
  // TODO: Invalidate session
  return c.json({ status: 'logged_out' });
});

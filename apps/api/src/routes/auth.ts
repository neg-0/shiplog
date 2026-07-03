import type { Context } from 'hono';
import { Hono } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { signToken } from '../lib/jwt.js';
import { encrypt, requireAuth } from '../lib/auth.js';
import { authLimiter } from '../lib/rate-limit.js';
import { githubCallbackSchema } from '../lib/schemas.js';
import { listReleases, fetchReleaseData } from '../services/github.js';
import { generateReleaseNotes } from '../services/generator.js';

/**
 * @module auth
 * @description Authentication routes using GitHub OAuth.
 */
export const auth = new Hono();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const APP_URL = process.env.APP_URL || 'https://shiplog.io';
const API_URL = process.env.API_URL || 'https://api.shiplog.io';

const isProduction = process.env.NODE_ENV === 'production';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

// The OAuth handshake spans two subdomains: the web app (e.g. www.shiplog.io) starts
// login through its /api proxy, but GitHub delivers the callback straight to the API
// host (e.g. api.shiplog.io). Only the short-lived oauth_state cookie must be readable
// on both, so it is scoped to the shared parent domain via COOKIE_DOMAIN=".shiplog.io".
// Session cookies are deliberately NOT given this domain: the browser only ever talks to
// the web origin (the proxy forwards to the API server-side), so keeping them host-only
// avoids exposing long-lived sessions to every subdomain (cookie theft / cookie tossing).
// Left unset in local dev (localhost shares cookies across ports), preserving behavior.
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;

function setAuthCookies(c: Context, token: string): void {
  c.header('Set-Cookie', `shiplog_session=${token}; HttpOnly; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${isProduction ? '; Secure' : ''}`, { append: true });
  c.header('Set-Cookie', `shiplog_logged_in=1; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${isProduction ? '; Secure' : ''}`, { append: true });
}

function clearAuthCookies(c: Context): void {
  c.header('Set-Cookie', `shiplog_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${isProduction ? '; Secure' : ''}`, { append: true });
  c.header('Set-Cookie', `shiplog_logged_in=; Path=/; Max-Age=0; SameSite=Lax${isProduction ? '; Secure' : ''}`, { append: true });
}

// Short-lived exchange codes for secure token delivery
const pendingCodes = new Map<string, { token: string; createdAt: number }>();
const CODE_TTL_MS = 30 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of pendingCodes) {
    if (now - entry.createdAt > CODE_TTL_MS) {
      pendingCodes.delete(code);
    }
  }
}, 60 * 1000);

/**
 * GET /github
 * @description Initiates the GitHub OAuth flow.
 */
auth.get('/github', (c) => {
  if (!GITHUB_CLIENT_ID) {
    return c.json({ error: 'GitHub OAuth not configured' }, 500);
  }

  const state = crypto.randomUUID();

  setCookie(c, 'oauth_state', state, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'Lax',
    maxAge: 60 * 10,
    path: '/',
    domain: COOKIE_DOMAIN,
  });

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: `${API_URL}/auth/github/callback`,
    scope: 'repo read:user user:email',
    state,
  });

  logger.info(`OAuth initiated`, { state: state.slice(0, 8) + '...' });

  return c.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

/**
 * GET /github/callback
 * @description Handles the GitHub OAuth callback.
 */
auth.get(
  '/github/callback',
  zValidator('query', githubCallbackSchema),
  async (c) => {
    const { code, state } = c.req.valid('query');
    const storedState = getCookie(c, 'oauth_state');

    logger.info(`OAuth callback`, { state: state?.slice(0, 8) + '...' });

    if (!state || !storedState || state !== storedState) {
      logger.warn(`Invalid state`, { received: state, stored: storedState });
      return c.json({ error: 'Invalid OAuth state' }, 400);
    }

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

    // Fetch verified primary email if needed
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

    // Use short-lived exchange code instead of putting token in URL
    const exchangeCode = crypto.randomUUID();
    pendingCodes.set(exchangeCode, { token: sessionToken, createdAt: Date.now() });

    const redirectUrl = new URL(`${APP_URL}/dashboard`);
    redirectUrl.searchParams.set('code', exchangeCode);

    logger.info(`OAuth complete for ${ghUser.login}`, { login: ghUser.login });

    return c.redirect(redirectUrl.toString());
  }
);

/**
 * POST /exchange
 * @description Exchange a short-lived code for an httpOnly session cookie.
 */
auth.post('/exchange', authLimiter, async (c) => {
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

/**
 * POST /demo
 * @description Creates a session for a demo user (only enabled via DEMO_ACCESS_TOKEN).
 */
auth.post('/demo', authLimiter, async (c) => {
  const demoToken = c.req.header('X-Demo-Token');
  if (!process.env.DEMO_ACCESS_TOKEN || demoToken !== process.env.DEMO_ACCESS_TOKEN) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Sales Tool: Import Repo & Generate Preview
  const body = await c.req.json().catch(() => ({}));
  if (body.repoUrl || body.repo) {
    const repoString = (body.repoUrl || body.repo) as string;

    const match = repoString.match(/github\.com\/([^\/]+)\/([^\/]+)/) || repoString.match(/^([^\/]+)\/([^\/]+)$/);

    if (!match) {
      return c.json({ error: 'Invalid repo format. Use "owner/repo" or full URL.' }, 400);
    }

    const owner = match[1];
    const repoName = match[2].replace(/\.git$/, '');
    const slug = `${owner}-${repoName}`.toLowerCase();

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
      const accessToken = process.env.GITHUB_TOKEN || '';

      const releases = await listReleases(owner, repoName, accessToken, 1);

      if (!releases || releases.length === 0) {
        return c.json({ error: 'No releases found for this repository' }, 404);
      }

      const release = releases[0];

      const data = await fetchReleaseData(owner, repoName, release?.tag_name, accessToken);

      const notes = await generateReleaseNotes({
        tagName: data.release?.tagName,
        previousTag: data.previousTag ?? undefined,
        releaseBody: data.release?.body ?? undefined,
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

      const preGen = await prisma.preGenChangelog.create({
        data: {
          slug,
          repoUrl: `https://github.com/${owner}/${repoName}`,
          repoOwner: owner,
          repoName: repoName,
          title: `Changelog for ${repoName} ${release?.tag_name}`,
          body: JSON.stringify(notes),
        },
      });

      return c.json({
        previewUrl: `${APP_URL}/preview/${preGen.slug}`,
        status: 'created',
        slug: preGen.slug
      });

    } catch (err: any) {
      logger.error(`Sales tool error for ${owner}/${repoName}`, { error: err.message });
      const isRateLimit = err.message?.includes('403') || err.message?.includes('rate limit');
      return c.json({
        error: isRateLimit ? 'GitHub rate limit exceeded' : 'Failed to generate preview'
      }, 500);
    }
  }

  // Demo Login Session (if no repo provided)
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

  // Use exchange code for demo login too
  const exchangeCode = crypto.randomUUID();
  pendingCodes.set(exchangeCode, { token: sessionToken, createdAt: Date.now() });

  return c.json({ code: exchangeCode, user: { id: dbUser.id, login: dbUser.login } });
});

/**
 * POST /logout
 * @description Logs out the user, revokes token, and clears cookies.
 */
auth.post('/logout', requireAuth, async (c) => {
  const user = c.get('user');
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogoutAt: new Date() },
  });
  clearAuthCookies(c);
  return c.json({ status: 'logged_out' });
});

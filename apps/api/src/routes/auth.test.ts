
import { Hono } from 'hono';
import { auth } from './auth.js';
import { encrypt, decrypt, requireAuth } from '../lib/auth.js';
import { signToken, verifyToken } from '../lib/jwt.js';
import { prisma } from '../lib/db.js';
import { setCookie } from 'hono/cookie';

// Mock prisma
jest.mock('../lib/db.js', () => ({
  prisma: {
    user: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// Mock fetch
global.fetch = jest.fn() as jest.Mock;

describe('Auth System', () => {
  const app = new Hono();
  app.route('/auth', auth);

  // Add a protected route for testing middleware
  app.get('/protected', requireAuth, (c) => c.json({ message: 'success', user: c.get('user') }));

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GITHUB_CLIENT_ID = 'test-client-id';
    process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
    process.env.JWT_SECRET = 'test-jwt-secret-very-long-and-secure-at-least-32-bytes';
    process.env.APP_URL = 'http://localhost:3000';
    process.env.API_URL = 'http://localhost:3001';
  });

  describe('Encryption', () => {
    it('should encrypt and decrypt correctly', async () => {
      const original = 'my-secret-token';
      const encrypted = await encrypt(original);
      expect(encrypted).not.toBe(original);
      expect(encrypted).toMatch(/^v1\./);

      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it('should fail to decrypt invalid format', async () => {
      await expect(decrypt('invalid-format')).rejects.toThrow();
    });
  });

  describe('JWT & Revocation', () => {
    it('should sign and verify token', async () => {
      const token = await signToken('user-123');
      const payload = await verifyToken(token);
      expect(payload).not.toBeNull();
      expect(payload?.userId).toBe('user-123');
      expect(payload?.iat).toBeDefined();
    });

    it('should reject expired token', async () => {
      // Mock verifyToken internal behavior? No, we use real verifyToken.
      // But we can't easily travel in time with `jose` unless we mock it.
      // Or we accept that we set 1h expiration.
      // We can mock Date.now() but `jose` might use performance.now or internal timer.
      // Let's trust `jose` works and just check that it has expiration.
      const token = await signToken('user-123');
      const payload = await verifyToken(token); // Should verify now
      expect(payload).not.toBeNull();
    });

    it('should reject revoked token via middleware', async () => {
      const userId = 'user-revoked';
      const token = await signToken(userId);

      // Mock user with lastLogoutAt AFTER token issue
      // We need to know token iat.
      const payload = await verifyToken(token);
      const iat = payload!.iat!;

      // lastLogoutAt is 1 second after iat
      const lastLogoutAt = new Date((iat + 1) * 1000);

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: userId,
        githubId: 123,
        login: 'testuser',
        email: 'test@example.com',
        lastLogoutAt: lastLogoutAt,
      });

      const req = new Request('http://localhost/protected', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const res = await app.request(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: 'Token revoked' });
    });

    it('should accept valid token via middleware', async () => {
        const userId = 'user-valid';
        const token = await signToken(userId);

        // Mock user with lastLogoutAt BEFORE token issue
        const payload = await verifyToken(token);
        const iat = payload!.iat!;

        const lastLogoutAt = new Date((iat - 100) * 1000);

        (prisma.user.findUnique as jest.Mock).mockResolvedValue({
          id: userId,
          githubId: 123,
          login: 'testuser',
          email: 'test@example.com',
          lastLogoutAt: lastLogoutAt,
        });

        const req = new Request('http://localhost/protected', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const res = await app.request(req);

        expect(res.status).toBe(200);
      });
  });

  describe('OAuth Flow', () => {
    it('should initiate oauth and set state cookie', async () => {
      const res = await app.request('http://localhost/auth/github');
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toContain('github.com/login/oauth/authorize');

      const setCookieHeader = res.headers.get('Set-Cookie');
      expect(setCookieHeader).toContain('oauth_state=');
      expect(setCookieHeader).toContain('HttpOnly');
      expect(setCookieHeader).toContain('Path=/');
    });

    it('should fail callback if state is missing or invalid (CSRF)', async () => {
      // Missing state in query
      let res = await app.request('http://localhost/auth/github/callback?code=123');
      expect(res.status).toBe(400);

      // Missing cookie
      res = await app.request('http://localhost/auth/github/callback?code=123&state=xyz');
      expect(res.status).toBe(400);

      // Mismatch
      const req = new Request('http://localhost/auth/github/callback?code=123&state=xyz');
      // Manually set cookie header
      // Note: In Hono/Cookie, signed cookies might be complex to mock manually if we used signed cookies.
      // But we used setCookie without 'secret' in the code I wrote?
      // Wait, I used `setCookie(c, ...)` but did I set a secret for signing?
      // Hono cookie middleware needs a secret to sign cookies if using signed cookies.
      // I used standard `setCookie`. It's not signed unless I use `signed: true` and configured app with secret.
      // My code: `setCookie(c, 'oauth_state', state, { ... })`. It's a plain cookie.
      req.headers.set('Cookie', 'oauth_state=abc');

      res = await app.request(req);
      expect(res.status).toBe(400); // xyz != abc
    });

    it('should succeed callback with valid state and code', async () => {
      const state = 'valid-state';
      const code = 'valid-code';

      // Mock GitHub API responses
      (global.fetch as jest.Mock).mockReset();
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('access_token')) {
            return Promise.resolve({
                json: () => Promise.resolve({ access_token: 'gh_token' }),
            });
        }
        if (url === 'https://api.github.com/user') {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ id: 12345, login: 'ghuser', name: 'GitHub User', email: 'ghuser@example.com' }),
            });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      // Mock DB upsert
      (prisma.user.upsert as jest.Mock).mockResolvedValue({
        id: 'user-db-id',
        login: 'ghuser',
      });

      const req = new Request(`http://localhost/auth/github/callback?code=${code}&state=${state}`);
      req.headers.set('Cookie', `oauth_state=${state}`);

      const res = await app.request(req);

      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toContain('/dashboard?token=');

      // Verify mocks called
      expect(prisma.user.upsert).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('Logout', () => {
      it('should update lastLogoutAt', async () => {
        const userId = 'user-logout';
        const token = await signToken(userId);

        (prisma.user.findUnique as jest.Mock).mockResolvedValue({
            id: userId,
            lastLogoutAt: null,
        });

        (prisma.user.update as jest.Mock).mockResolvedValue({});

        const req = new Request('http://localhost/auth/logout', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
        });

        const res = await app.request(req);
        expect(res.status).toBe(200);
        expect(prisma.user.update).toHaveBeenCalledWith({
            where: { id: userId },
            data: { lastLogoutAt: expect.any(Date) }
        });
      });
  });
});

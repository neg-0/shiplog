import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Hono } from 'hono';

const mockPrisma = {
  user: {
    upsert: jest.fn<any>(),
    findUnique: jest.fn<any>(),
    update: jest.fn<any>(),
  },
  preGenChangelog: {
    findUnique: jest.fn<any>(),
  },
};

jest.unstable_mockModule('../lib/db.js', () => ({
  prisma: mockPrisma,
}));

jest.unstable_mockModule('../lib/rate-limit.js', () => ({
  authLimiter: async (_c: any, next: any) => { await next(); },
  apiLimiter: async (_c: any, next: any) => { await next(); },
  webhookLimiter: async (_c: any, next: any) => { await next(); },
  rateLimit: () => async (_c: any, next: any) => { await next(); },
}));

const mockFetch = jest.fn<any>();
global.fetch = mockFetch as any;

// Set env vars BEFORE module imports (auth.ts reads them at module scope)
process.env.GITHUB_CLIENT_ID = 'test-client-id';
process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
process.env.JWT_SECRET = 'test-jwt-secret-very-long-and-secure-at-least-32-bytes';
process.env.APP_URL = 'http://localhost:3000';
process.env.API_URL = 'http://localhost:3001';

const { auth } = await import('./auth.js');
const { encrypt, decrypt, requireAuth } = await import('../lib/auth.js');
const { signToken, verifyToken } = await import('../lib/jwt.js');

describe('Auth System', () => {
  const app = new Hono();
  app.route('/auth', auth);

  // Add a protected route for testing middleware
  app.get('/protected', requireAuth, (c) => c.json({ message: 'success', user: c.get('user') }));

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('Encryption', () => {
    it('should encrypt and decrypt correctly', async () => {
      const original = 'my-secret-token';
      const encrypted = await encrypt(original);
      expect(encrypted).not.toBe(original);
      expect(encrypted).toMatch(/^v2\./);

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

    it('should reject revoked token via middleware', async () => {
      const userId = 'user-revoked';
      const token = await signToken(userId);

      const payload = await verifyToken(token);
      const iat = payload!.iat!;

      const lastLogoutAt = new Date((iat + 1) * 1000);

      mockPrisma.user.findUnique.mockResolvedValue({
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

      const payload = await verifyToken(token);
      const iat = payload!.iat!;

      const lastLogoutAt = new Date((iat - 100) * 1000);

      mockPrisma.user.findUnique.mockResolvedValue({
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
      let res = await app.request('http://localhost/auth/github/callback?code=123');
      expect(res.status).toBe(400);

      res = await app.request('http://localhost/auth/github/callback?code=123&state=xyz');
      expect(res.status).toBe(400);

      const req = new Request('http://localhost/auth/github/callback?code=123&state=xyz');
      req.headers.set('Cookie', 'oauth_state=abc');

      res = await app.request(req);
      expect(res.status).toBe(400);
    });

    it('should succeed callback with valid state and code', async () => {
      const state = 'valid-state';
      const code = 'valid-code';

      mockFetch.mockImplementation((url: string) => {
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

      mockPrisma.user.upsert.mockResolvedValue({
        id: 'user-db-id',
        login: 'ghuser',
      });

      const req = new Request(`http://localhost/auth/github/callback?code=${code}&state=${state}`);
      req.headers.set('Cookie', `oauth_state=${state}`);

      const res = await app.request(req);

      expect(res.status).toBe(302);
      // OAuth callback now uses exchange code
      expect(res.headers.get('Location')).toContain('/dashboard');

      expect(mockPrisma.user.upsert).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Logout', () => {
    it('should update lastLogoutAt', async () => {
      const userId = 'user-logout';
      const token = await signToken(userId);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        githubId: 123,
        login: 'testuser',
        email: 'test@example.com',
        lastLogoutAt: null,
      });

      mockPrisma.user.update.mockResolvedValue({});

      const req = new Request('http://localhost/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      const res = await app.request(req);
      expect(res.status).toBe(200);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { lastLogoutAt: expect.any(Date) }
      });
    });
  });
});

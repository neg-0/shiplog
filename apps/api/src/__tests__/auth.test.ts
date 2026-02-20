import { jest, describe, it, expect, beforeEach, afterAll, beforeAll } from '@jest/globals';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';

// Mock dependencies using unstable_mockModule for ESM support
jest.unstable_mockModule('../lib/db.js', () => ({
  __esModule: true,
  prisma: mockDeep<PrismaClient>(),
}));

jest.unstable_mockModule('../lib/auth.js', () => ({
  encrypt: jest.fn().mockResolvedValue('v1.encrypted.token'),
  decrypt: jest.fn().mockResolvedValue('decrypted-token'),
}));

jest.unstable_mockModule('../lib/jwt.js', () => ({
  signToken: jest.fn().mockResolvedValue('mock-session-token'),
}));

// Mock environment variables
const OLD_ENV = process.env;

describe('Auth Routes', () => {
  let auth: any;
  let prismaMock: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    process.env.GITHUB_CLIENT_ID = 'mock-client-id';
    process.env.GITHUB_CLIENT_SECRET = 'mock-client-secret';
    process.env.APP_URL = 'http://localhost:3000';
    process.env.API_URL = 'http://localhost:3001';

    // Re-import mocks and modules
    const db = await import('../lib/db.js');
    prismaMock = db.prisma as unknown as DeepMockProxy<PrismaClient>;

    const module = await import('../routes/auth.js');
    auth = module.auth;

    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = OLD_ENV;
    jest.useRealTimers();
  });

  beforeAll(() => {
    jest.useFakeTimers();
  });

  describe('GET /github', () => {
    it('redirects to GitHub OAuth', async () => {
      const res = await auth.request('/github');
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toContain('github.com/login/oauth/authorize');
      expect(res.headers.get('Location')).toContain('client_id=mock-client-id');
    });

    it('returns error if GitHub OAuth not configured', async () => {
      jest.resetModules();
      delete process.env.GITHUB_CLIENT_ID;
      const module = await import('../routes/auth.js');
      const authNoConfig = module.auth;

      const res = await authNoConfig.request('/github');
      expect(res.status).toBe(500);
    });
  });

  describe('GET /github/callback', () => {
    it('handles successful callback', async () => {
      // 1. Initiate flow to get state
      const initRes = await auth.request('/github');
      const location = initRes.headers.get('Location');
      const url = new URL(location!);
      const state = url.searchParams.get('state');

      // 2. Mock GitHub token response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({ access_token: 'gh-access-token' }),
        ok: true,
      });

      // 3. Mock GitHub user response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({
          id: 123,
          login: 'testuser',
          name: 'Test User',
          email: 'test@example.com',
          avatar_url: 'avatar.png',
        }),
        ok: true,
      });

      // 4. Mock DB upsert
      prismaMock.user.upsert.mockResolvedValue({
        id: 'user-id-123',
        githubId: 123,
        login: 'testuser',
        email: 'test@example.com',
      } as any);

      const res = await auth.request(`/github/callback?code=mock-code&state=${state}`);

      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toContain('http://localhost:3000/dashboard?token=mock-session-token');
      expect(prismaMock.user.upsert).toHaveBeenCalled();
    });

    it('returns error for invalid state', async () => {
      const res = await auth.request('/github/callback?code=mock-code&state=invalid-state');
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid OAuth state' });
    });

    it('returns error if no code provided', async () => {
      const res = await auth.request('/github/callback?state=some-state');
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'No code provided' });
    });
  });

  describe('POST /demo', () => {
    it('allows demo login when enabled', async () => {
      process.env.ENABLE_DEMO_LOGIN = 'true';

      prismaMock.user.upsert.mockResolvedValue({
        id: 'demo-user-id',
        login: 'demo-user',
      } as any);

      const res = await auth.request('/demo', { method: 'POST' });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        token: 'mock-session-token',
        user: { id: 'demo-user-id', login: 'demo-user' },
      });
    });

    it('rejects demo login when disabled', async () => {
      process.env.ENABLE_DEMO_LOGIN = 'false';
      const res = await auth.request('/demo', { method: 'POST' });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /logout', () => {
    it('returns logged_out status', async () => {
      const res = await auth.request('/logout', { method: 'POST' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'logged_out' });
    });
  });
});

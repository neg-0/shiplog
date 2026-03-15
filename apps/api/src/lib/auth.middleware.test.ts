import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockDeep } from 'jest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Mocks – must be set up BEFORE dynamic imports
// ---------------------------------------------------------------------------

const prismaMock = mockDeep<PrismaClient>();
const verifyTokenMock = jest.fn<any>();

jest.unstable_mockModule('./db.js', () => ({
  prisma: prismaMock,
}));

jest.unstable_mockModule('./jwt.js', () => ({
  verifyToken: verifyTokenMock,
}));

jest.unstable_mockModule('./logger.js', () => ({
  setLoggerContext: jest.fn(),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Dynamic import of the module under test
let requireAuth: any;
let optionalAuth: any;

beforeEach(async () => {
  jest.clearAllMocks();
  const authModule = await import('./auth.js');
  requireAuth = authModule.requireAuth;
  optionalAuth = authModule.optionalAuth;
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockUser = {
  id: 'user-1',
  githubId: 12345,
  login: 'testuser',
  email: 'test@example.com',
  lastLogoutAt: null,
};

const validPayload = { userId: 'user-1', iat: Math.floor(Date.now() / 1000) };

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------

describe('requireAuth middleware', () => {
  function buildApp() {
    const app = new Hono();
    app.use('/*', requireAuth);
    app.get('/test', (c: any) => c.json({ user: c.get('user') }));
    return app;
  }

  it('returns 401 when no cookie and no Authorization header present', async () => {
    const app = buildApp();
    const res = await app.request('/test');

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/missing/i);
  });

  it('returns 401 when Bearer token is invalid (verifyToken returns null)', async () => {
    verifyTokenMock.mockResolvedValue(null);

    const app = buildApp();
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer bad-token' },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/invalid|expired/i);
  });

  it('returns 401 when user not found in DB', async () => {
    verifyTokenMock.mockResolvedValue(validPayload);
    prismaMock.user.findUnique.mockResolvedValue(null as any);

    const app = buildApp();
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer valid-token' },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/user not found/i);
  });

  it('returns 401 when token was issued before user lastLogoutAt (revocation)', async () => {
    const logoutTime = new Date();
    const issuedBefore = Math.floor(logoutTime.getTime() / 1000) - 60; // 60s before logout

    verifyTokenMock.mockResolvedValue({ userId: 'user-1', iat: issuedBefore });
    prismaMock.user.findUnique.mockResolvedValue({
      ...mockUser,
      lastLogoutAt: logoutTime,
    } as any);

    const app = buildApp();
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer revoked-token' },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/revoked/i);
  });

  it('sets user on context and calls next() for valid cookie-based auth', async () => {
    verifyTokenMock.mockResolvedValue(validPayload);
    prismaMock.user.findUnique.mockResolvedValue(mockUser as any);

    const app = buildApp();
    const res = await app.request('/test', {
      headers: { Cookie: 'shiplog_session=cookie-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe('user-1');
    expect(body.user.login).toBe('testuser');
    expect(verifyTokenMock).toHaveBeenCalledWith('cookie-token');
  });

  it('sets user on context and calls next() for valid Bearer token auth', async () => {
    verifyTokenMock.mockResolvedValue(validPayload);
    prismaMock.user.findUnique.mockResolvedValue(mockUser as any);

    const app = buildApp();
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer bearer-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe('user-1');
    expect(body.user.login).toBe('testuser');
    expect(verifyTokenMock).toHaveBeenCalledWith('bearer-token');
  });
});

// ---------------------------------------------------------------------------
// optionalAuth
// ---------------------------------------------------------------------------

describe('optionalAuth middleware', () => {
  function buildApp() {
    const app = new Hono();
    app.use('/*', optionalAuth);
    app.get('/test', (c: any) => {
      const user = c.get('user');
      return c.json({ user: user ?? null });
    });
    return app;
  }

  it('calls next() even with no auth token (user not set on context)', async () => {
    const app = buildApp();
    const res = await app.request('/test');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toBeNull();
  });

  it('sets user on context when valid token present', async () => {
    verifyTokenMock.mockResolvedValue(validPayload);
    prismaMock.user.findUnique.mockResolvedValue(mockUser as any);

    const app = buildApp();
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer valid-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).not.toBeNull();
    expect(body.user.id).toBe('user-1');
    expect(body.user.login).toBe('testuser');
  });

  it('calls next() without setting user when token is invalid', async () => {
    verifyTokenMock.mockResolvedValue(null);

    const app = buildApp();
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer bad-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toBeNull();
  });
});

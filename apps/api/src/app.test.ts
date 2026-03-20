import { jest, describe, it, expect } from '@jest/globals';
import { mockDeep } from 'jest-mock-extended';
import type { PrismaClient } from '@prisma/client';

jest.unstable_mockModule('./lib/db.js', () => ({
  prisma: mockDeep<PrismaClient>(),
}));

// Mock isomorphic-dompurify to avoid ESM/jsdom issues in test environment
jest.unstable_mockModule('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (s: string) => s },
}));

jest.unstable_mockModule('./lib/rate-limit.js', () => ({
  apiLimiter: async (_c: any, next: any) => { await next(); },
  authLimiter: async (_c: any, next: any) => { await next(); },
  webhookLimiter: async (_c: any, next: any) => { await next(); },
  rateLimit: () => async (_c: any, next: any) => { await next(); },
}));

jest.unstable_mockModule('./lib/auth.js', () => ({
  requireAuth: async (c: any, next: any) => {
    c.set('user', { id: 'test-user-id' });
    await next();
  },
  optionalAuth: async (_c: any, next: any) => { await next(); },
  encrypt: jest.fn().mockResolvedValue('encrypted'),
  decrypt: jest.fn().mockResolvedValue('decrypted'),
}));

jest.unstable_mockModule('stripe', () => ({
  default: jest.fn(() => ({})),
}));

process.env.APP_URL = 'https://shiplog.io';

const { app, getAllowedCorsOrigins } = await import('./app.js');

describe('App', () => {
  it('should return root info', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('Warning')).toBeNull();
    const body = await res.json();
    expect(body).toHaveProperty('name', 'ShipLog API');
    expect(body).toHaveProperty('status', 'operational');
  });

  it('should support /v1/health', async () => {
    const res = await app.request('/v1/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status', 'healthy');
  });

  it('should support legacy /health with deprecation warning', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('Warning')).toContain('deprecated');
    const body = await res.json();
    expect(body).toHaveProperty('status', 'healthy');
  });

  it('should support /health with X-API-Version: 1 without warning', async () => {
    const res = await app.request('/health', {
      headers: {
        'X-API-Version': '1',
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Warning')).toBeNull();
    const body = await res.json();
    expect(body).toHaveProperty('status', 'healthy');
  });

  it('should reject unsupported version', async () => {
    const res = await app.request('/health', {
      headers: {
        'X-API-Version': '99',
      },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unsupported API version' });
  });

  it('should allow both bare and www ShipLog origins when APP_URL is bare domain', () => {
    const origins = getAllowedCorsOrigins({ APP_URL: 'https://shiplog.io' } as NodeJS.ProcessEnv);
    expect(origins).toContain('https://shiplog.io');
    expect(origins).toContain('https://www.shiplog.io');
  });

  it('should allow both bare and www ShipLog origins when APP_URL is www domain', () => {
    const origins = getAllowedCorsOrigins({ APP_URL: 'https://www.shiplog.io' } as NodeJS.ProcessEnv);
    expect(origins).toContain('https://shiplog.io');
    expect(origins).toContain('https://www.shiplog.io');
  });

  it('should emit CORS header for https://www.shiplog.io', async () => {
    const res = await app.request('/health', {
      headers: {
        Origin: 'https://www.shiplog.io',
      },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://www.shiplog.io');
  });

  it('should emit CORS header for https://shiplog.io', async () => {
    const res = await app.request('/health', {
      headers: {
        Origin: 'https://shiplog.io',
      },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://shiplog.io');
  });

  it('should enforce CSRF Content-Type on POST', async () => {
    const res = await app.request('/repos', {
      method: 'POST',
    });
    expect(res.status).toBe(415);
  });

  it('should exempt webhooks from CSRF check', async () => {
    const res = await app.request('/webhooks/github', {
      method: 'POST',
      body: '{}',
    });
    expect(res.status).not.toBe(415);
  });
});

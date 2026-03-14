import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import type { Hono } from 'hono';

const mockPrisma = {
  $queryRaw: jest.fn<any>(),
};

const mockBalanceRetrieve = jest.fn<any>();

jest.unstable_mockModule('../lib/db.js', () => ({
  prisma: mockPrisma,
}));

jest.unstable_mockModule('stripe', () => ({
  __esModule: true,
  default: jest.fn<any>().mockImplementation(() => ({
    balance: {
      retrieve: mockBalanceRetrieve,
    },
  })),
}));

jest.unstable_mockModule('../lib/auth.js', () => ({
  requireAuth: async (c: any, next: any) => {
    c.set('user', { id: 'test-user-id' });
    await next();
  },
}));

jest.unstable_mockModule('../lib/metrics.js', () => ({
  metrics: {
    releasesProcessed: 42,
    distributionsSent: 100,
    generationTimeTotal: 5000,
    generationCount: 10,
    errorCounts: 2,
  },
}));

const mockFetch = jest.fn<any>();
global.fetch = mockFetch as any;

// Polyfill AbortSignal.timeout for test environment if needed
if (!AbortSignal.timeout) {
  // @ts-ignore
  AbortSignal.timeout = (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  };
}

describe('Health Routes', () => {
  let health: Hono;

  beforeEach(async () => {
    jest.resetModules();
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';

    const mod = await import('./health.js');
    health = mod.health;

    mockBalanceRetrieve.mockReset();
    mockFetch.mockReset();
    mockPrisma.$queryRaw.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  test('GET /ready returns 200', async () => {
    const res = await health.request('/ready');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ready' });
  });

  test('GET /metrics returns metrics', async () => {
    const res = await health.request('/metrics');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('releasesProcessed');
    expect(body).toHaveProperty('distributionsSent');
  });

  test('GET / returns 200 when all healthy', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([1]);
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    mockBalanceRetrieve.mockResolvedValue({});

    const res = await health.request('/');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('GET / returns 503 when DB fails', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('DB Error'));
    mockFetch.mockResolvedValue({ ok: true });
    mockBalanceRetrieve.mockResolvedValue({});

    const res = await health.request('/');
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('degraded');
  });

  test('GET / returns 503 when GitHub fails', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([1]);
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    mockBalanceRetrieve.mockResolvedValue({});

    const res = await health.request('/');
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('degraded');
  });

  test('GET / returns 503 when Stripe fails', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([1]);
    mockFetch.mockResolvedValue({ ok: true });
    mockBalanceRetrieve.mockRejectedValue(new Error('Stripe Error'));

    const res = await health.request('/');
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('degraded');
  });
});

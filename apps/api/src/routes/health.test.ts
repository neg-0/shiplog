import { Hono } from 'hono';
import { prisma } from '../lib/db.js';

// Mock dependencies
jest.mock('../lib/db.js', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}));

const mockBalanceRetrieve = jest.fn();
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    balance: {
      retrieve: mockBalanceRetrieve,
    },
  }));
});

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// Polyfill AbortSignal.timeout for test environment if needed
if (!AbortSignal.timeout) {
  // @ts-ignore
  AbortSignal.timeout = (ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  };
}

describe('Health Routes', () => {
  let health: Hono;
  let prismaMock: any;

  beforeEach(async () => {
    jest.resetModules();
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';

    // Import db mock first to get reference to the instance used in this isolation context
    const dbMod = await import('../lib/db.js');
    prismaMock = dbMod.prisma;

    // Dynamic import to pick up env vars
    const mod = await import('./health.js');
    health = mod.health;

    mockBalanceRetrieve.mockReset();
    mockFetch.mockReset();
    prismaMock.$queryRaw.mockReset();
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
    expect(body).toHaveProperty('totalRequests');
    expect(body).toHaveProperty('releasesProcessed');
  });

  test('GET / returns 200 when all healthy', async () => {
    prismaMock.$queryRaw.mockResolvedValue([1]);
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    mockBalanceRetrieve.mockResolvedValue({});

    const res = await health.request('/');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(body.checks.stripe).toBe(true);
  });

  test('GET / returns 503 when DB fails', async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error('DB Error'));
    mockFetch.mockResolvedValue({ ok: true });
    mockBalanceRetrieve.mockResolvedValue({});

    const res = await health.request('/');
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('unhealthy');
    expect(body.checks.database).toBe(false);
  });

  test('GET / returns 503 when GitHub fails', async () => {
    prismaMock.$queryRaw.mockResolvedValue([1]);
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    mockBalanceRetrieve.mockResolvedValue({});

    const res = await health.request('/');
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.checks.github).toBe(false);
  });

  test('GET / returns 503 when Stripe fails', async () => {
    prismaMock.$queryRaw.mockResolvedValue([1]);
    mockFetch.mockResolvedValue({ ok: true });
    mockBalanceRetrieve.mockRejectedValue(new Error('Stripe Error'));

    const res = await health.request('/');
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.checks.stripe).toBe(false);
  });
});

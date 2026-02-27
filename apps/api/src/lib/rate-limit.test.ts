import { Hono } from 'hono';
import { rateLimit } from './rate-limit.js';
import { describe, expect, test, jest, beforeEach, afterAll } from '@jest/globals';

describe('Rate Limiter', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    // Reset store via some mechanism?
    // Since store is module-level, it persists across tests if not cleared.
    // However, we use different keys in tests to avoid collision, or we can't easily clear it.
    // For unit tests, maybe we should export `store` for testing or add a clear method?
    // But since keys are strings, I'll just use unique keys per test or random keys.
  });

  afterAll(() => {
    // Clean up interval to allow Jest to exit
    // @ts-ignore
    if (globalThis.rateLimitInterval) {
      // @ts-ignore
      clearInterval(globalThis.rateLimitInterval);
    }
  });

  test('should allow requests within limit', async () => {
    const limit = 2;
    const key = `test-key-${Date.now()}-1`;
    const limiter = rateLimit({
      windowMs: 60 * 1000,
      limit,
      keyGenerator: () => key,
    });

    app.get('/', limiter, (c) => c.text('OK'));

    const res1 = await app.request('/');
    expect(res1.status).toBe(200);
    expect(res1.headers.get('X-RateLimit-Remaining')).toBe('1');

    const res2 = await app.request('/');
    expect(res2.status).toBe(200);
    expect(res2.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  test('should block requests over limit', async () => {
    const limit = 1;
    const key = `test-key-${Date.now()}-2`;
    const limiter = rateLimit({
      windowMs: 60 * 1000,
      limit,
      keyGenerator: () => key,
    });

    app.get('/', limiter, (c) => c.text('OK'));

    await app.request('/'); // Consumes 1
    const res = await app.request('/'); // Consumes 2 (blocked)

    expect(res.status).toBe(429);
    expect(await res.text()).toBe('Too Many Requests');
    expect(res.headers.get('Retry-After')).toBeDefined();
  });

  // Note: Testing time-based expiry with real timers is slow.
  // Using fake timers with Hono's app.request might be tricky if Hono uses internal timers?
  // Hono doesn't use timers for request handling itself.
  // But our rate limiter uses `Date.now()`. Jest mocks `Date` too with legacy fake timers, or modern ones.
  // Let's try simple fake timers.

  test('should reset limit after window', async () => {
    jest.useFakeTimers();
    const limit = 1;
    const windowMs = 1000;
    const key = `test-key-time-${Math.random()}`;
    const limiter = rateLimit({
      windowMs,
      limit,
      keyGenerator: () => key,
    });

    app.get('/', limiter, (c) => c.text('OK'));

    await app.request('/'); // Consumes 1

    // Advance time past window
    jest.advanceTimersByTime(windowMs + 100);

    const res = await app.request('/'); // Should be allowed
    expect(res.status).toBe(200);

    jest.useRealTimers();
  });

  test('should separate limits by key', async () => {
    const limit = 1;
    const limiter = rateLimit({
      windowMs: 60 * 1000,
      limit,
      keyGenerator: (c) => c.req.header('x-user') || 'default',
    });

    app.get('/', limiter, (c) => c.text('OK'));

    // User A consumes 1
    await app.request('/', { headers: { 'x-user': 'A' } });

    // User B consumes 1 (should be allowed)
    const res = await app.request('/', { headers: { 'x-user': 'B' } });
    expect(res.status).toBe(200);

    // User A tries again (blocked)
    const resBlocked = await app.request('/', { headers: { 'x-user': 'A' } });
    expect(resBlocked.status).toBe(429);
  });
});

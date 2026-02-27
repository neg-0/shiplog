import type { Context, Next } from 'hono';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

/**
 * Creates an in-memory rate limiting middleware for Hono.
 * Tracks requests per IP address within a sliding window.
 */
export function rateLimit({ windowMs, maxRequests }: RateLimitOptions) {
  const store = new Map<string, RateLimitEntry>();

  // Periodically clean up expired entries every minute
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) {
        store.delete(key);
      }
    }
  }, 60_000);

  return async function rateLimitMiddleware(c: Context, next: Next): Promise<Response | void> {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const now = Date.now();

    const entry = store.get(ip);

    if (!entry || now >= entry.resetAt) {
      store.set(ip, { count: 1, resetAt: now + windowMs });
      await next();
      return;
    }

    entry.count += 1;

    if (entry.count > maxRequests) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfterSeconds));
      return c.json({ error: 'Too many requests' }, 429);
    }

    await next();
  };
}

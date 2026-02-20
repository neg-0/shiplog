import { Context, MiddlewareHandler } from 'hono';

interface RateLimitOptions {
  windowMs: number;
  limit: number;
  keyGenerator: (c: Context) => string;
  skip?: (c: Context) => boolean;
}

// In-memory store: Map<key, timestamp[]>
const store = new Map<string, number[]>();

// Cleanup interval (every minute)
const CLEANUP_INTERVAL = 60 * 1000;

// Ensure we don't leak the interval in tests or hot reloads
// @ts-ignore
if (!globalThis.rateLimitInterval) {
  // @ts-ignore
  globalThis.rateLimitInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of store.entries()) {
      // Clean up empty or expired entries
      // We assume a max window of 1 minute for cleanup purposes as per requirements
      const maxWindow = 60 * 1000;

      if (timestamps.length === 0) {
        store.delete(key);
        continue;
      }

      const validTimestamps = timestamps.filter(t => now - t < maxWindow);
      if (validTimestamps.length === 0) {
        store.delete(key);
      } else {
        // Optimization: only update if changed? Arrays are mutable reference, so we replace it if filtered
        if (validTimestamps.length !== timestamps.length) {
          store.set(key, validTimestamps);
        }
      }
    }
  }, CLEANUP_INTERVAL);
}

export const rateLimit = (options: RateLimitOptions): MiddlewareHandler => {
  return async (c, next) => {
    if (options.skip && options.skip(c)) {
      await next();
      return;
    }

    const key = options.keyGenerator(c);
    if (!key) {
      await next();
      return;
    }

    const now = Date.now();
    const windowStart = now - options.windowMs;

    let timestamps = store.get(key) || [];

    // Filter out old timestamps
    timestamps = timestamps.filter(t => t > windowStart);

    const currentUsage = timestamps.length;
    // We want to show remaining requests *including* this one if it succeeds,
    // or simply (limit - (currentUsage + 1)).
    // But if we block, remaining is 0.

    const oldestTimestamp = timestamps.length > 0 ? timestamps[0] : now;
    const resetTime = new Date(oldestTimestamp + options.windowMs);

    if (currentUsage >= options.limit) {
      const retryAfter = Math.ceil((resetTime.getTime() - now) / 1000);
      c.header('X-RateLimit-Limit', options.limit.toString());
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', Math.ceil(resetTime.getTime() / 1000).toString());
      c.header('Retry-After', retryAfter.toString());
      return c.text('Too Many Requests', 429);
    }

    const remaining = Math.max(0, options.limit - (currentUsage + 1));

    // Set standard headers
    c.header('X-RateLimit-Limit', options.limit.toString());
    c.header('X-RateLimit-Remaining', remaining.toString());
    c.header('X-RateLimit-Reset', Math.ceil(resetTime.getTime() / 1000).toString());

    // Add current request to timestamps
    timestamps.push(now);
    store.set(key, timestamps);

    await next();
  };
};

const getIp = (c: Context) => {
  return c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
};

// 1. Auth: 10/min per IP
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: (c) => `auth:${getIp(c)}`,
});

// 2. API: 60/min per user
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  keyGenerator: (c) => {
    const user = c.get('user');
    return user ? `user:${user.id}` : `ip:${getIp(c)}`;
  },
});

// 3. Webhooks: 100/min per repo
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  keyGenerator: (c) => {
    const hookId = c.req.header('x-github-hook-id');
    return hookId ? `webhook:${hookId}` : `webhook-ip:${getIp(c)}`;
  },
});

// 4. Public: 30/min per IP
export const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (c) => `public:${getIp(c)}`,
});

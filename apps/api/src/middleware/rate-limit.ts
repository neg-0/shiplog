import { Context, Next } from 'hono';

interface RateLimitConfig {
  windowMs: number;
  limit: number;
  message?: string;
  statusCode?: number;
}

export function rateLimit(config: RateLimitConfig) {
  // Map to store request counts: IP -> { count, resetAt }
  const requests = new Map<string, { count: number; resetAt: number }>();

  return async (c: Context, next: Next) => {
    const ip = c.req.header('x-forwarded-for') || 'unknown';
    const now = Date.now();

    let record = requests.get(ip);

    // If no record or window expired, reset
    if (!record || now > record.resetAt) {
      record = {
        count: 0,
        resetAt: now + config.windowMs
      };
      requests.set(ip, record);
    }

    record.count++;

    if (record.count > config.limit) {
      return c.json(
        { error: config.message || 'Too many requests' },
        (config.statusCode || 429) as any
      );
    }

    await next();
  };
  return undefined;
}

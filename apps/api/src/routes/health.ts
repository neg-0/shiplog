import { Hono } from 'hono';

/**
 * @module health
 * @description Health check routes.
 */
export const health = new Hono();

/**
 * GET /
 * @description Simple health check endpoint.
 * @returns {object} Status, timestamp, and uptime.
 */
health.get('/', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

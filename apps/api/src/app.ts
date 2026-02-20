import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { registerV1Routes } from './registry.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

// V1 App
const v1 = new Hono();
registerV1Routes(v1);

// Mount V1
app.route('/v1', v1);

// Legacy / Unversioned Support
app.use('*', async (c, next) => {
  // If path starts with /v1, skip this middleware
  if (c.req.path.startsWith('/v1')) {
    return next();
  }

  // Skip for root path to avoid deprecating the API info endpoint
  if (c.req.path === '/') {
    return next();
  }

  const versionHeader = c.req.header('X-API-Version');

  // If explicit version 1, proceed without warning
  if (versionHeader === '1') {
    return next();
  }

  // If explicit but invalid version (not '1')
  if (versionHeader && versionHeader !== '1') {
     return c.json({ error: 'Unsupported API version' }, 400);
  }

  // If no header (or legacy), add deprecation warning
  c.header('Warning', '299 - "This endpoint is deprecated. Please use /v1/..."');
  await next();
});

// Mount V1 at root for backward compatibility
app.route('/', v1);

// Root Info Route
app.get('/', (c) => {
  return c.json({
    name: 'ShipLog API',
    version: '0.1.0',
    status: 'operational',
    docs: 'https://shiplog.io/docs',
  });
});

export { app };

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { rateLimit } from './lib/rate-limit.js';
import { webhooks } from './routes/webhooks.js';
import { auth } from './routes/auth.js';
import { repos } from './routes/repos.js';
import { releases } from './routes/releases.js';
import { health } from './routes/health.js';
import { changelog } from './routes/changelog.js';
import { user } from './routes/user.js';
import { billing } from './routes/billing.js';
import { organizations } from './routes/organizations.js';
import { activity } from './routes/activity.js';
import { admin } from './routes/admin.js';
import { publicChangelog } from './routes/public.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

// CSRF protection: reject non-GET requests without proper Content-Type
// Browsers prevent cross-origin requests with application/json Content-Type without CORS preflight
app.use('*', async (c, next) => {
  const method = c.req.method;
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const contentType = c.req.header('Content-Type') || '';
    const isWebhook = c.req.path.startsWith('/webhooks') || c.req.path.startsWith('/billing/webhook');
    // Skip for webhooks (they use their own signature verification)
    if (!isWebhook && !contentType.includes('application/json')) {
      return c.json({ error: 'Invalid Content-Type' }, 415);
    }
  }
  await next();
});

// Rate limiting per route group
app.use('/webhooks/*', rateLimit({ windowMs: 60_000, maxRequests: 30 }));
app.use('/auth/*', rateLimit({ windowMs: 60_000, maxRequests: 10 }));
app.use('/admin/*', rateLimit({ windowMs: 60_000, maxRequests: 60 }));

// Routes
app.route('/health', health);
app.route('/webhooks', webhooks);
app.route('/auth', auth);
app.route('/repos', repos);
app.route('/releases', releases);
app.route('/user', user);
app.route('/users', user);
app.route('/billing', billing);
app.route('/changelog', changelog);
app.route('/organizations', organizations);
app.route('/activity', activity);
app.route('/admin', admin);
app.route('/public', publicChangelog);

// Root
app.get('/', (c) => {
  return c.json({
    name: 'ShipLog API',
    version: '0.1.0',
    status: 'operational',
    docs: 'https://shiplog.io/docs',
  });
});

const port = parseInt(process.env.PORT || '3001');

console.log(`🚢 ShipLog API running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});

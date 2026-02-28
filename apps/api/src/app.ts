import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { securityHeaders } from './middleware/security.js';
import { webhookLimiter } from './lib/rate-limit.js';
import { webhooks } from './routes/webhooks.js';
import { feedback } from './routes/feedback.js';
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
import { preview } from './routes/preview.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', securityHeaders());
app.use('*', cors({
  origin: process.env.APP_URL || process.env.CORS_ORIGIN || 'http://localhost:3000',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
  credentials: true,
}));

// CSRF protection: require Content-Type: application/json on state-changing requests.
// This prevents cross-origin form submissions (which can only send url-encoded/multipart).
// Exempt webhooks and billing webhooks which receive non-JSON payloads.
app.use('*', async (c, next) => {
  const method = c.req.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }
  const path = c.req.path;
  if (path.startsWith('/webhooks') || path.startsWith('/billing/webhook')) {
    return next();
  }
  const contentType = c.req.header('Content-Type');
  if (!contentType || !contentType.includes('application/json')) {
    return c.json({ error: 'Content-Type must be application/json' }, 415);
  }
  return next();
});

// Routes
app.route('/health', health);
app.use('/webhooks/*', webhookLimiter);
app.route('/webhooks', webhooks);
app.route('/feedback', feedback);
app.route('/auth', auth);
app.route('/repos', repos);
app.route('/releases', releases);
app.route('/user', user);
app.route('/billing', billing);
app.route('/changelog', changelog);
app.route('/organizations', organizations);
app.route('/activity', activity);
app.route('/admin', admin);
app.route('/public', publicChangelog);
app.route('/preview', preview);

// Root
app.get('/', (c) => {
  return c.json({
    name: 'ShipLog API',
    version: '0.1.0',
    status: 'operational',
    docs: 'https://shiplog.io/docs',
  });
});

export default app;

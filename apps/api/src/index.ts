import { serve } from '@hono/node-server';
import app from './app.js';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger, requestLogger } from './lib/logger.js';
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
import { metrics } from './lib/metrics.js';
import { authLimiter, webhookLimiter, publicLimiter } from './lib/rate-limit.js';

const app = new Hono();

// Middleware
app.use('*', async (c, next) => {
  metrics.totalRequests++;
  await next();
});
app.use('*', logger());
app.use('*', requestLogger);
app.use('*', cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

// Rate Limiters
app.use('/auth/*', authLimiter);
app.use('/webhooks/*', webhookLimiter);
app.use('/public/*', publicLimiter);
app.use('/preview/*', publicLimiter);
app.use('/changelog/*', publicLimiter);

// Routes
app.route('/health', health);
app.route('/webhooks', webhooks);
app.route('/feedback', feedback);
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

app.onError((err, c) => {
  console.error(err);
  metrics.errorCounts++;
  return c.json({ error: 'Internal Server Error' }, 500);
});

const port = parseInt(process.env.PORT || '3001');

logger.info(`🚢 ShipLog API running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});

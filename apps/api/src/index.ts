import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { webhooks } from './routes/webhooks.js';
import { auth } from './routes/auth.js';
import { repos } from './routes/repos.js';
import { releases } from './routes/releases.js';
import { health } from './routes/health.js';
import { changelog } from './routes/changelog.js';
import { publicRoutes } from './routes/public.js';
import { user } from './routes/user.js';
import { billing } from './routes/billing.js';
import { activity } from './routes/activity.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

// Routes
app.route('/health', health);
app.route('/webhooks', webhooks);
app.route('/auth', auth);
app.route('/repos', repos);
app.route('/releases', releases);
app.route('/user', user);
app.route('/billing', billing);
app.route('/activity', activity);
app.route('/', publicRoutes);
app.route('/changelog', changelog);

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

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { webhooks } from './routes/webhooks';
import { auth } from './routes/auth';
import { repos } from './routes/repos';
import { releases } from './routes/releases';
import { health } from './routes/health';

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
app.route('/api/repos', repos);
app.route('/api/releases', releases);

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

export default {
  port,
  fetch: app.fetch,
};

import { serve } from '@hono/node-server';
import app from './app.js';
import { logger } from './lib/logger.js';

const port = parseInt(process.env.PORT || '3001');

logger.info(`🚢 ShipLog API running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});

import { Hono } from 'hono';
import { prisma } from '../lib/db.js';

export const health = new Hono();

health.get('/', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

health.get('/db', async (c) => {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    
    return c.json({
      status: 'connected',
      latency: `${latency}ms`,
    });
  } catch (error) {
    return c.json({
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

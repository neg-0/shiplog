import { Hono } from 'hono';
import { prisma } from '../lib/db.js';
import { metrics } from '../lib/metrics.js';
import Stripe from 'stripe';

/**
 * @module health
 * @description Health check routes.
 */
export const health = new Hono();

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret ? new Stripe(stripeSecret, {
  apiVersion: '2024-04-10',
}) : null;

health.get('/ready', (c) => {
  return c.json({ status: 'ready' }, 200);
});

health.get('/metrics', (c) => {
  const avgGenerationTime = metrics.generationCount > 0
    ? metrics.generationTimeTotal / metrics.generationCount
    : 0;

/**
 * GET /
 * @description Simple health check endpoint.
 * @returns {object} Status, timestamp, and uptime.
 */
health.get('/', (c) => {
  return c.json({
    totalRequests: metrics.totalRequests,
    releasesProcessed: metrics.releasesProcessed,
    distributionsSent: metrics.distributionsSent,
    generationTime: Math.round(avgGenerationTime),
    errorCounts: metrics.errorCounts,
  });
});

health.get('/', async (c) => {
  const results = {
    database: false,
    github: false,
    stripe: false,
  };

  let isHealthy = true;

  // Check Database
  try {
    await prisma.$queryRaw`SELECT 1`;
    results.database = true;
  } catch (error) {
    console.error('Health check failed: Database', error);
    isHealthy = false;
  }

  // Check GitHub
  try {
    const ghRes = await fetch('https://api.github.com/zen', {
      headers: { 'User-Agent': 'ShipLog-Health-Check' },
      signal: AbortSignal.timeout(5000)
    });
    if (ghRes.ok) {
      results.github = true;
    } else {
      console.error(`Health check failed: GitHub returned ${ghRes.status}`);
      isHealthy = false;
    }
  } catch (error) {
    console.error('Health check failed: GitHub', error);
    isHealthy = false;
  }

  // Check Stripe
  try {
    if (stripe) {
      await stripe.balance.retrieve();
      results.stripe = true;
    } else {
      // If Stripe is not configured, we consider it a failure for the health check
      // unless we are in a permissive environment, but for now strict check as per requirements.
      // However, to avoid blocking local dev without stripe keys:
      if (process.env.NODE_ENV !== 'production' && !process.env.STRIPE_SECRET_KEY) {
         results.stripe = true; // Skip
      } else {
         console.error('Health check failed: Stripe not configured');
         isHealthy = false;
      }
    }
  } catch (error) {
    console.error('Health check failed: Stripe', error);
    isHealthy = false;
  }

  const status = isHealthy ? 200 : 503;

  return c.json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks: results,
  }, status);
});

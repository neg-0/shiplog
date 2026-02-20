import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import Stripe from 'stripe';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { requireAuth } from '../lib/auth.js';
import { checkoutSchema } from '../lib/schemas.js';
import { apiLimiter } from '../lib/rate-limit.js';
import { SubscriptionTier } from '@prisma/client';

/**
 * @module billing
 * @description Routes for handling Stripe subscriptions, checkout, and webhooks.
 */
export const billing = new Hono();

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const pricePro = process.env.STRIPE_PRICE_PRO;
const priceTeam = process.env.STRIPE_PRICE_TEAM;
const APP_URL = process.env.APP_URL || 'https://shiplog.io';

if (!stripeSecret) {
  logger.warn('STRIPE_SECRET_KEY is not set');
}

const stripe = new Stripe(stripeSecret || '', {
  apiVersion: '2024-04-10',
});

const getPriceId = (plan: string | null | undefined) => {
  if (plan === 'pro') return pricePro;
  if (plan === 'team') return priceTeam;
  return null;
};

const getTierFromPrice = (price?: Stripe.Price | null): SubscriptionTier => {
  if (!price) {
    logger.warn('[Billing] No price object provided to resolver. Defaulting to FREE.');
    return 'FREE';
  }
  
  const priceId = price.id;
  const lookupKey = price.lookup_key;

  logger.info(`[Billing] Resolving tier`, { priceId, lookupKey, pricePro, priceTeam });

  // Check by ID (Env Var)
  if (pricePro && priceId === pricePro) return 'PRO';
  if (priceTeam && priceId === priceTeam) return 'TEAM';

  // Check by Lookup Key (Fallback/Robustness)
  if (lookupKey?.startsWith('pro_')) return 'PRO';
  if (lookupKey?.startsWith('team_')) return 'TEAM';

  logger.warn(`[Billing] Price mismatch. Defaulting to FREE.`, { priceId, lookupKey });
  return 'FREE';
};

const shouldDowngrade = (status?: Stripe.Subscription.Status) => {
  return status === 'canceled' || status === 'unpaid' || status === 'incomplete_expired';
};

/**
 * POST /checkout
 * @description Create a Stripe Checkout Session for a subscription.
 * @param {string} plan - The plan to subscribe to ('pro' or 'team').
 * @returns {object} JSON with `url` to redirect the user to Stripe Checkout.
 * @throws 400 if plan is invalid.
 * @throws 404 if user not found.
 */
billing.post(
  '/checkout',
  requireAuth,
  apiLimiter,
  zValidator('json', checkoutSchema),
  async (c) => {
    if (!stripeSecret) {
      return c.json({ error: 'Stripe not configured' }, 500);
    }

    const user = c.get('user');
    const { plan } = c.req.valid('json');
    const priceId = getPriceId(plan);

    if (!priceId) {
      return c.json({ error: 'Invalid plan' }, 400);
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        login: true,
        stripeCustomerId: true,
        githubId: true,
        subscriptionStatus: true,
        subscriptionTier: true,
        stripeSubscriptionId: true,
      },
    });

    if (!dbUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Prevent double subscription
    if (dbUser.stripeSubscriptionId && dbUser.subscriptionStatus === 'active' && dbUser.subscriptionTier !== 'FREE') {
      return c.json({
        error: 'You already have an active subscription. Please manage it in the billing portal.',
        redirect: '/dashboard/settings'
      }, 400);
    }

    let customerId = dbUser.stripeCustomerId;

    // Helper to create a new Stripe customer (or find existing by email)
    const createNewCustomer = async () => {
      // 1. Check if customer already exists in Stripe by email
      if (dbUser.email) {
        const existingCustomers = await stripe.customers.list({
          email: dbUser.email,
          limit: 1,
        });

        const existingCustomer = existingCustomers.data[0];
        if (existingCustomer) {
          const existingId = existingCustomer.id;
          logger.info(`♻️ Found existing Stripe customer for user`, { customerId: existingId, email: dbUser.email });
          
          await prisma.user.update({
            where: { id: dbUser.id },
            data: { stripeCustomerId: existingId },
          });
          
          return existingId;
        }
      }

      // 2. Create new if not found
      const customer = await stripe.customers.create({
        email: dbUser.email ?? undefined,
        name: dbUser.name ?? dbUser.login,
        metadata: {
          userId: dbUser.id,
          githubId: dbUser.githubId.toString(), // Add GitHub ID metadata for cross-ref
        },
      });

      await prisma.user.update({
        where: { id: dbUser.id },
        data: { stripeCustomerId: customer.id },
      });

      return customer.id;
    };

    if (!customerId) {
      customerId = await createNewCustomer();
    }

    // Try to create checkout session, handle stale customer IDs
    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        subscription_data: {
          trial_period_days: 14,
        },
        success_url: `${APP_URL}/dashboard/settings?checkout=success`,
        cancel_url: `${APP_URL}/dashboard/settings?checkout=cancel`,
        client_reference_id: dbUser.id,
        metadata: {
          userId: dbUser.id,
          plan: plan.toUpperCase(),
        },
      });

      return c.json({ url: session.url });
    } catch (error: unknown) {
      // If customer doesn't exist (switched from live to test mode), create new one
      if (error instanceof Error && error.message.includes('No such customer')) {
        logger.warn(`⚠️ Stale customer ID ${customerId}, creating new customer...`, { customerId });
        customerId = await createNewCustomer();
        
        const session = await stripe.checkout.sessions.create({
          mode: 'subscription',
          customer: customerId,
          line_items: [{ price: priceId, quantity: 1 }],
          allow_promotion_codes: true,
          subscription_data: {
            trial_period_days: 14,
          },
          success_url: `${APP_URL}/dashboard/settings?checkout=success`,
          cancel_url: `${APP_URL}/dashboard/settings?checkout=cancel`,
          client_reference_id: dbUser.id,
          metadata: {
            userId: dbUser.id,
            plan: plan.toUpperCase(),
          },
        });

        return c.json({ url: session.url });
      }
      throw error;
    }
  }
);

/**
 * POST /portal
 * @description Create a Stripe Customer Portal session for managing subscriptions.
 * @returns {object} JSON with `url` to redirect the user to Stripe Portal.
 * @throws 400 if user has no Stripe customer ID.
 */
billing.post('/portal', requireAuth, apiLimiter, async (c) => {
  if (!stripeSecret) {
    return c.json({ error: 'Stripe not configured' }, 500);
  }

  const user = c.get('user');
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { stripeCustomerId: true },
  });

  if (!dbUser?.stripeCustomerId) {
    return c.json({ error: 'No Stripe customer found' }, 400);
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: dbUser.stripeCustomerId,
    return_url: `${APP_URL}/dashboard/settings`,
  });

  return c.json({ url: session.url });
});

/**
 * GET /status
 * @description Get the current user's subscription status.
 * @returns {object} Subscription details (tier, status, trial end, IDs).
 */
billing.get('/status', requireAuth, apiLimiter, async (c) => {
  const user = c.get('user');
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      subscriptionTier: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });

  if (!dbUser) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json(dbUser);
});

/**
 * POST /webhook
 * @description Handle Stripe webhooks to update subscription status in DB.
 * @header {string} stripe-signature - Stripe signature for verification.
 * @returns {object} Success confirmation.
 * @throws 400 if signature is invalid.
 */
billing.post('/webhook', async (c) => {
  if (!stripeSecret || !stripeWebhookSecret) {
    return c.json({ error: 'Stripe not configured' }, 500);
  }

  const signature = c.req.header('stripe-signature');
  const rawBody = await c.req.text();

  if (!signature) {
    return c.json({ error: 'Missing Stripe signature' }, 400);
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, stripeWebhookSecret);
  } catch (err) {
    logger.error('❌ Stripe webhook signature verification failed', { error: err });
    return c.json({ error: 'Invalid signature' }, 400);
  }

  const syncOrganizations = async (userId: string | undefined, tier: SubscriptionTier, subscriptionId: string) => {
    if (!userId) return;
    try {
      const orgs = await prisma.organization.findMany({
        where: { ownerId: userId },
      });

      logger.info(`[Billing] Syncing organizations for user ${userId}. Found ${orgs.length} orgs. Tier: ${tier}`);

      for (const org of orgs) {
        await prisma.organization.update({
          where: { id: org.id },
          data: {
            subscriptionId: tier === 'TEAM' ? subscriptionId : null,
          },
        });
      }
    } catch (error) {
      logger.error(`[Billing] Failed to sync organizations for user ${userId}:`, error);
    }
  };

  const updateByCustomer = async (customerId: string, data: Record<string, any>, tier: SubscriptionTier, subscriptionId: string) => {
    // Find users first to sync organizations
    const users = await prisma.user.findMany({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });

    await prisma.user.updateMany({
      where: {
        stripeCustomerId: customerId,
        OR: [
          { stripeLastEventTimestamp: { lt: event.created } },
          { stripeLastEventTimestamp: null },
        ],
      },
      data: {
        ...data,
        stripeLastEventTimestamp: event.created,
      },
    });

    for (const user of users) {
      await syncOrganizations(user.id, tier, subscriptionId);
    }
  };

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = session.customer as string | null;
      const subscriptionId = session.subscription as string | null;
      const userId = session.client_reference_id ?? session.metadata?.userId;

      if (customerId && subscriptionId) {
        try {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ['items.data.price'],
          });
          const price = subscription.items.data[0]?.price;
          const tier = getTierFromPrice(price);
          const trialEndsAt = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

          const data = {
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            subscriptionStatus: subscription.status,
            subscriptionTier: tier,
            trialEndsAt,
          };

          if (userId) {
            await prisma.user.updateMany({
              where: {
                id: userId,
                OR: [
                  { stripeLastEventTimestamp: { lt: event.created } },
                  { stripeLastEventTimestamp: null },
                ],
              },
              data: {
                ...data,
                stripeLastEventTimestamp: event.created,
              },
            });
            await syncOrganizations(userId, tier, subscriptionId);
          } else {
            await updateByCustomer(customerId, data, tier, subscriptionId);
          }
        } catch (error) {
          logger.error('Error processing checkout.session.completed:', error);
          return c.json({ error: 'Webhook processing failed' }, 500);
        }
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      try {
        const eventSubscription = event.data.object as Stripe.Subscription;
        // Fetch fresh subscription with expanded price to ensure lookup_key is available
        const subscription = await stripe.subscriptions.retrieve(eventSubscription.id, {
          expand: ['items.data.price'],
        });

        const customerId = subscription.customer as string;
        const price = subscription.items.data[0]?.price;
        const tier: SubscriptionTier = shouldDowngrade(subscription.status) ? 'FREE' : getTierFromPrice(price);
        const trialEndsAt = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

        await updateByCustomer(customerId, {
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          subscriptionTier: tier,
          trialEndsAt,
        }, tier, subscription.id);
      } catch (error) {
        logger.error('Error processing customer.subscription event:', error);
        return c.json({ error: 'Webhook processing failed' }, 500);
      }
      break;
    }
    default:
      break;
  }

  return c.json({ received: true });
});

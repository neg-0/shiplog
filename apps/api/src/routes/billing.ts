import { Hono } from 'hono';
import Stripe from 'stripe';
import { prisma } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';

export const billing = new Hono();

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const pricePro = process.env.STRIPE_PRICE_PRO;
const priceTeam = process.env.STRIPE_PRICE_TEAM;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

if (!stripeSecret) {
  console.warn('⚠️ STRIPE_SECRET_KEY is not set');
}

const stripe = new Stripe(stripeSecret || '', {
  apiVersion: '2024-04-10',
});

const getPriceId = (plan: string | null | undefined) => {
  if (plan === 'pro') return pricePro;
  if (plan === 'team') return priceTeam;
  return null;
};

import { SubscriptionTier } from '@prisma/client';

const getTierFromPrice = (priceId?: string | null): SubscriptionTier => {
  if (priceId && priceId === pricePro) return 'PRO';
  if (priceId && priceId === priceTeam) return 'TEAM';
  return 'FREE';
};

const shouldDowngrade = (status?: Stripe.Subscription.Status) => {
  return status === 'canceled' || status === 'unpaid' || status === 'incomplete_expired';
};

billing.post('/checkout', requireAuth, async (c) => {
  if (!stripeSecret) {
    return c.json({ error: 'Stripe not configured' }, 500);
  }

  const user = c.get('user');
  const plan = c.req.query('plan') ?? (await c.req.json().catch(() => ({})) as { plan?: string }).plan;
  const priceId = getPriceId(plan);

  if (!plan || !priceId) {
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
      githubId: true, // Add this
    },
  });

  if (!dbUser) {
    return c.json({ error: 'User not found' }, 404);
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

      if (existingCustomers.data.length > 0) {
        const existingId = existingCustomers.data[0].id;
        console.log(`♻️ Found existing Stripe customer ${existingId} for ${dbUser.email}`);
        
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
      console.log(`⚠️ Stale customer ID ${customerId}, creating new customer...`);
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
});

billing.post('/portal', requireAuth, async (c) => {
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

billing.get('/status', requireAuth, async (c) => {
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
    console.error('❌ Stripe webhook signature verification failed', err);
    return c.json({ error: 'Invalid signature' }, 400);
  }

  const updateByCustomer = async (customerId: string, data: Record<string, unknown>) => {
    await prisma.user.updateMany({
      where: { stripeCustomerId: customerId },
      data,
    });
  };

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = session.customer as string | null;
      const subscriptionId = session.subscription as string | null;
      const userId = session.client_reference_id ?? session.metadata?.userId;

      if (customerId && subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ['items.data.price'],
        });
        const priceId = subscription.items.data[0]?.price?.id;
        const tier = getTierFromPrice(priceId);
        const trialEndsAt = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

        const data = {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          subscriptionStatus: subscription.status,
          subscriptionTier: tier,
          trialEndsAt,
        };

        if (userId) {
          await prisma.user.update({
            where: { id: userId },
            data,
          });
        } else {
          await updateByCustomer(customerId, data);
        }
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const priceId = subscription.items.data[0]?.price?.id;
      const tier: SubscriptionTier = shouldDowngrade(subscription.status) ? 'FREE' : getTierFromPrice(priceId);
      const trialEndsAt = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

      await updateByCustomer(customerId, {
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        subscriptionTier: tier,
        trialEndsAt,
      });
      break;
    }
    default:
      break;
  }

  return c.json({ received: true });
});

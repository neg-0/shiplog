type SubscriptionTier = "FREE" | "PRO" | "TEAM";
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import Stripe from 'stripe';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { requireAuth } from '../lib/auth.js';
import { checkoutSchema } from '../lib/schemas.js';
import { apiLimiter } from '../lib/rate-limit.js';


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

const stripe = stripeSecret ? new Stripe(stripeSecret, {
  apiVersion: '2024-04-10',
}) : null;

const getPriceId = (plan: string | null | undefined) => {
  if (plan === 'pro') return pricePro;
  if (plan === 'team') return priceTeam;
  return null;
};

const getTierFromPrice = (price?: Stripe.Price | null): SubscriptionTier => {
  if (!price) {
    throw new Error('Subscription price is missing');
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

  // A configuration mismatch must not remove a paying customer's access.
  // Fail the webhook so Stripe retries once the price mapping has been corrected.
  logger.error('[Billing] Unrecognized subscription price', { priceId, lookupKey });
  throw new Error('Unrecognized subscription price');
};

const shouldDowngrade = (status?: Stripe.Subscription.Status) => {
  return status === 'canceled' || status === 'unpaid' || status === 'incomplete_expired';
};

const lifecycleRequestOptions = { timeout: 10_000, maxNetworkRetries: 0 };

async function hasUnfinishedSubscription(customerId: string): Promise<boolean> {
  let startingAfter: string | undefined;
  for (let page = 0; page < 20; page++) {
    const subscriptions = await stripe!.subscriptions.list(
      { customer: customerId, status: 'all', limit: 100, starting_after: startingAfter }, lifecycleRequestOptions,
    );
    if (subscriptions.data.some(subscription => !['canceled', 'incomplete_expired'].includes(subscription.status))) return true;
    if (!subscriptions.has_more) return false;
    startingAfter = subscriptions.data.at(-1)?.id;
    if (!startingAfter) break;
  }
  throw new Error('Could not verify all Stripe subscriptions');
}

/** Refuse deletion until Stripe confirms there is nothing left that can become billable. */
export async function accountDeletionBillingBlock(customerId: string): Promise<{ error: string; status: 409 | 503 } | null> {
  if (!stripe) return { error: 'Billing verification is temporarily unavailable. Please try deleting your account later.', status: 503 };
  try {
    // Check open sessions first: a session completing during verification must
    // subsequently be caught by the subscription query, not fall between them.
    const sessions = await stripe.checkout.sessions.list(
      { customer: customerId, status: 'open', limit: 1 }, lifecycleRequestOptions,
    );
    if (sessions.data.length) {
      return { error: 'An unfinished checkout is still open. Let it expire or contact support to close it before deleting your account.', status: 409 };
    }

    if (await hasUnfinishedSubscription(customerId)) {
      return { error: 'Stripe still has an unfinished subscription. Cancel it in the billing portal before deleting your account.', status: 409 };
    }
    return null;
  } catch (error) {
    logger.error('Could not verify billing before account deletion', { error });
  }
  return { error: 'Billing verification is temporarily unavailable. Please try deleting your account later.', status: 503 };
}

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
    if (!stripe) {
      return c.json({ error: 'Stripe not configured' }, 500);
    }

    const user = c.get('user');
    const { plan } = c.req.valid('json');
    const priceId = getPriceId(plan);

    if (!priceId) {
      return c.json({ error: 'Invalid plan' }, 400);
    }

    const readLockedUser = async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
      return tx.user.findUnique({
        where: { id: user.id },
        select: {
          id: true, email: true, name: true, login: true, githubId: true,
          stripeCustomerId: true, subscriptionStatus: true, subscriptionTier: true,
          stripeSubscriptionId: true,
        },
      });
    };
    const transactionOptions = { maxWait: 10_000, timeout: 60_000 };

    // Commit the customer identity before creating a checkout. If a later
    // transaction fails, deletion can still discover the session in Stripe.
    const prepareCustomer = async (refresh: boolean) => prisma.$transaction(async (tx) => {
      const dbUser = await readLockedUser(tx);
      if (!dbUser) return c.json({ error: 'User not found' }, 404);
      if (dbUser.stripeSubscriptionId && !['canceled', 'incomplete_expired'].includes(dbUser.subscriptionStatus ?? '')) {
        return c.json({ error: 'You already have a subscription. Please manage it in the billing portal.', redirect: '/dashboard/settings' }, 400);
      }
      if (dbUser.stripeCustomerId && !refresh) return null;

      // Email is mutable and can be shared; it does not establish account ownership.
      const customer = await stripe.customers.create({
        email: dbUser.email ?? undefined,
        name: dbUser.name ?? dbUser.login,
        metadata: { userId: dbUser.id, githubId: dbUser.githubId.toString() },
      }, { ...lifecycleRequestOptions, idempotencyKey: `shiplog-customer-${dbUser.id}-${dbUser.stripeCustomerId ?? 'initial'}` });
      await tx.user.update({ where: { id: dbUser.id }, data: { stripeCustomerId: customer.id } });
      return null;
    }, transactionOptions);

    for (let attempt = 0; attempt < 2; attempt++) {
      const preparation = await prepareCustomer(attempt > 0);
      if (preparation) return preparation;
      try {
        return await prisma.$transaction(async (tx) => {
          // Re-read after preparation: deletion may have completed between phases.
          // This same lock guards deletion's authoritative Stripe verification.
          const dbUser = await readLockedUser(tx);
          if (!dbUser) return c.json({ error: 'User not found' }, 404);
          if (dbUser.stripeSubscriptionId && !['canceled', 'incomplete_expired'].includes(dbUser.subscriptionStatus ?? '')) {
            return c.json({ error: 'You already have a subscription. Please manage it in the billing portal.', redirect: '/dashboard/settings' }, 400);
          }
          if (!dbUser.stripeCustomerId) return c.json({ error: 'Billing account could not be verified. Please try again.' }, 503);

          const openSessions = await stripe.checkout.sessions.list(
            { customer: dbUser.stripeCustomerId, status: 'open', limit: 1 }, lifecycleRequestOptions,
          );
          if (await hasUnfinishedSubscription(dbUser.stripeCustomerId)) {
            return c.json({ error: 'You already have a subscription. Please manage it in the billing portal.', redirect: '/dashboard/settings' }, 409);
          }
          const openSession = openSessions.data[0];
          if (openSession) {
            if (openSession.client_reference_id === dbUser.id && openSession.metadata?.plan === plan.toUpperCase() && openSession.url) {
              return c.json({ url: openSession.url });
            }
            return c.json({ error: 'An unfinished checkout is already open. Complete it or let it expire before starting another.' }, 409);
          }
          // A terminal session advances the key; retries of an uncertain create
          // retain the same key even when the requested plan changes.
          const previousSessions = await stripe.checkout.sessions.list(
            { customer: dbUser.stripeCustomerId, limit: 1 }, lifecycleRequestOptions,
          );
          const previousSession = previousSessions.data[0];
          if (previousSession?.status === 'open') {
            return c.json({ error: 'A checkout is already open. Please try again to resume it.' }, 409);
          }
          const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: dbUser.stripeCustomerId,
            line_items: [{ price: priceId, quantity: 1 }],
            allow_promotion_codes: true,
            subscription_data: { trial_period_days: 14 },
            success_url: `${APP_URL}/dashboard/settings?checkout=success`,
            cancel_url: `${APP_URL}/dashboard/settings?checkout=cancel`,
            client_reference_id: dbUser.id,
            metadata: { userId: dbUser.id, plan: plan.toUpperCase() },
          }, { ...lifecycleRequestOptions, idempotencyKey: `shiplog-checkout-${dbUser.stripeCustomerId}-${previousSession?.id ?? 'initial'}` });
          return c.json({ url: session.url });
        }, transactionOptions);
      } catch (error) {
        // Recover a deleted/test-mode customer in its own committed preparation phase.
        if (attempt === 0 && error instanceof Error && error.message.includes('No such customer')) continue;
        throw error;
      }
    }
    return c.json({ error: 'Could not prepare checkout. Please try again.' }, 503);
  }
);

/**
 * POST /portal
 * @description Create a Stripe Customer Portal session for managing subscriptions.
 * @returns {object} JSON with `url` to redirect the user to Stripe Portal.
 * @throws 400 if user has no Stripe customer ID.
 */
billing.post('/portal', requireAuth, apiLimiter, async (c) => {
  if (!stripe) {
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
  if (!stripe || !stripeWebhookSecret) {
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

  const updateUserSubscription = async (
    where: Prisma.UserWhereInput,
    data: Prisma.UserUpdateManyMutationInput,
    tier: SubscriptionTier,
    subscriptionId: string,
    userId: string,
  ) => {
    // Keep the timestamp and organization entitlement in the same transaction.
    // A stale event must not touch organizations, and failed org sync must be retryable.
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: {
          ...where,
          OR: [
            { stripeLastEventTimestamp: { lt: event.created } },
            { stripeLastEventTimestamp: null },
          ],
        },
        data: { ...data, stripeLastEventTimestamp: event.created },
      });

      if (updated.count === 0) return;

      await tx.organization.updateMany({
        where: { ownerId: userId },
        data: { subscriptionId: tier === 'TEAM' ? subscriptionId : null },
      });
    });
  };

  const updateByCustomer = async (customerId: string, data: Prisma.UserUpdateManyMutationInput, tier: SubscriptionTier, subscriptionId: string) => {
    const users = await prisma.user.findMany({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });

    for (const user of users) {
      await updateUserSubscription(
        { id: user.id, stripeCustomerId: customerId },
        data, tier, subscriptionId, user.id,
      );
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
          const tier = shouldDowngrade(subscription.status) ? 'FREE' : getTierFromPrice(price);
          const trialEndsAt = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

          const data = {
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            subscriptionStatus: subscription.status,
            subscriptionTier: tier,
            trialEndsAt,
          };

          if (userId) {
            await updateUserSubscription({ id: userId }, data, tier, subscriptionId, userId);
          } else {
            await updateByCustomer(customerId, data, tier, subscriptionId);
          }
        } catch (error) {
          logger.error('Error processing checkout.session.completed:', { error: error instanceof Error ? error.message : String(error) });
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
        logger.error('Error processing customer.subscription event:', { error: error instanceof Error ? error.message : String(error) });
        return c.json({ error: 'Webhook processing failed' }, 500);
      }
      break;
    }
    default:
      break;
  }

  return c.json({ received: true });
});

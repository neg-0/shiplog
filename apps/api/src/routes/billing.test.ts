import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { Hono } from 'hono';

// Mock data
const mockPrisma = {
  user: {
    findUnique: jest.fn<any>(),
    update: jest.fn<any>(),
    updateMany: jest.fn<any>(),
    findMany: jest.fn<any>(),
  },
  $transaction: jest.fn<any>(),
  organization: {
    updateMany: jest.fn<any>(),
    findMany: jest.fn<any>(),
    update: jest.fn<any>(),
  },
};

const mockStripe = {
  customers: {
    list: jest.fn<any>(),
    create: jest.fn<any>(),
  },
  checkout: {
    sessions: {
      create: jest.fn<any>(),
    },
  },
  billingPortal: {
    sessions: {
      create: jest.fn<any>(),
    },
  },
  webhooks: {
    constructEvent: jest.fn<any>(),
  },
  subscriptions: {
    retrieve: jest.fn<any>(),
  },
};

jest.unstable_mockModule('../lib/auth.js', () => ({
  requireAuth: jest.fn<any>(async (c: any, next: any) => {
    c.set('user', { id: 'user_123' });
    await next();
  }),
}));

jest.unstable_mockModule('../lib/db.js', () => ({
  prisma: mockPrisma,
}));

jest.unstable_mockModule('stripe', () => ({
  __esModule: true,
  default: jest.fn<any>((secret: string) => {
    if (!secret) throw new Error('Stripe requires an API key');
    return mockStripe;
  }),
}));

const OLD_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...OLD_ENV };
  process.env.STRIPE_SECRET_KEY = 'sk_test_123';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123';
  process.env.STRIPE_PRICE_PRO = 'price_pro_123';
  process.env.STRIPE_PRICE_TEAM = 'price_team_123';
});

afterEach(() => {
  process.env = OLD_ENV;
});

describe('Billing Route', () => {
  let billingRoute: Hono;

  beforeEach(async () => {
    jest.resetModules();
    const mod = await import('./billing.js');
    billingRoute = mod.billing;
    mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockPrisma));
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'user_123' }]);
    mockPrisma.organization.findMany.mockResolvedValue([]);
  });

  describe('Webhook: customer.subscription.updated', () => {
    it('should resolve TEAM tier from price ID', async () => {
      const event = {
        type: 'customer.subscription.updated',
        created: 1000,
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            status: 'active',
            items: { data: [{ price: { id: 'price_team_123' } }] },
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(event);
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        items: { data: [{ price: { id: 'price_team_123', lookup_key: 'team_monthly' } }] },
      });

      const req = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_123' },
        body: 'raw_body',
      });
      const res = await billingRoute.request(req);

      expect(res.status).toBe(200);
      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'user_123',
          stripeCustomerId: 'cus_123',
          OR: [
            { stripeLastEventTimestamp: { lt: 1000 } },
            { stripeLastEventTimestamp: null },
          ],
        },
        data: expect.objectContaining({
          subscriptionTier: 'TEAM',
          stripeLastEventTimestamp: 1000,
        }),
      });
    });

    it('should resolve TEAM tier from lookup_key if ID mismatches but key is correct', async () => {
      const event = {
        type: 'customer.subscription.updated',
        created: 1000,
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            status: 'active',
            items: { data: [{ price: { id: 'price_random' } }] },
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(event);
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        items: { data: [{ price: { id: 'price_random', lookup_key: 'team_annual' } }] },
      });

      const req = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_123' },
        body: 'raw_body',
      });
      const res = await billingRoute.request(req);

      expect(res.status).toBe(200);
      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'user_123',
          stripeCustomerId: 'cus_123',
          OR: [
            { stripeLastEventTimestamp: { lt: 1000 } },
            { stripeLastEventTimestamp: null },
          ],
        },
        data: expect.objectContaining({
          subscriptionTier: 'TEAM',
          stripeLastEventTimestamp: 1000,
        }),
      });
    });

    it('should update Organization subscriptionId when upgrading to TEAM', async () => {
      const event = {
        type: 'customer.subscription.updated',
        created: 1000,
        data: {
          object: {
            id: 'sub_team_123',
            customer: 'cus_123',
            status: 'active',
            items: { data: [{ price: { id: 'price_team_123' } }] },
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(event);
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_team_123',
        customer: 'cus_123',
        status: 'active',
        items: { data: [{ price: { id: 'price_team_123', lookup_key: 'team_monthly' } }] },
      });

      mockPrisma.user.findMany.mockResolvedValue([{ id: 'user_123' }]);
      mockPrisma.organization.findMany.mockResolvedValue([{ id: 'org_1' }]);

      const req = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_123' },
        body: 'raw_body',
      });
      const res = await billingRoute.request(req);

      expect(res.status).toBe(200);
      expect(mockPrisma.organization.updateMany).toHaveBeenCalledWith({
        where: { ownerId: 'user_123' },
        data: { subscriptionId: 'sub_team_123' }
      });
    });

    it('does not change an organization when a stale event did not update its owner', async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        type: 'customer.subscription.updated', created: 1000,
        data: { object: { id: 'sub_123' } },
      });
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_123', customer: 'cus_123', status: 'canceled',
        items: { data: [{ price: { id: 'price_team_123' } }] },
      });
      mockPrisma.user.updateMany.mockResolvedValue({ count: 0 });

      const res = await billingRoute.request('/webhook', {
        method: 'POST', headers: { 'stripe-signature': 'sig' }, body: '{}',
      });

      expect(res.status).toBe(200);
      expect(mockPrisma.organization.updateMany).not.toHaveBeenCalled();
    });

    it('returns a retryable error instead of downgrading an unrecognized paid price to FREE', async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        type: 'customer.subscription.updated', created: 1000,
        data: { object: { id: 'sub_123' } },
      });
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_123', customer: 'cus_123', status: 'active',
        items: { data: [{ price: { id: 'price_not_configured', lookup_key: null } }] },
      });

      const res = await billingRoute.request('/webhook', {
        method: 'POST', headers: { 'stripe-signature': 'sig' }, body: '{}',
      });

      expect(res.status).toBe(500);
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.organization.updateMany).not.toHaveBeenCalled();
    });

    it('returns a retryable error when organization entitlement synchronization fails', async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        type: 'customer.subscription.updated', created: 1000,
        data: { object: { id: 'sub_123' } },
      });
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_123', customer: 'cus_123', status: 'active',
        items: { data: [{ price: { id: 'price_team_123' } }] },
      });
      mockPrisma.organization.updateMany.mockRejectedValueOnce(new Error('Database unavailable'));

      const res = await billingRoute.request('/webhook', {
        method: 'POST', headers: { 'stripe-signature': 'sig' }, body: '{}',
      });

      expect(res.status).toBe(500);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('Webhook: checkout.session.completed', () => {
    it('should verify signature and process checkout.session.completed', async () => {
      const event = {
        id: 'evt_123',
        type: 'checkout.session.completed',
        created: 1000,
        data: {
          object: {
            customer: 'cus_123',
            subscription: 'sub_123',
            client_reference_id: 'user_123',
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(event);
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_123',
        status: 'active',
        items: { data: [{ price: { id: 'price_pro_123' } }] },
      });

      const req = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_123' },
        body: 'raw_body',
      });

      const res = await billingRoute.request(req);
      expect(res.status).toBe(200);
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalled();

      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'user_123',
          OR: [
            { stripeLastEventTimestamp: { lt: 1000 } },
            { stripeLastEventTimestamp: null },
          ],
        },
        data: expect.objectContaining({
          stripeLastEventTimestamp: 1000,
          subscriptionStatus: 'active',
          subscriptionTier: 'PRO',
        }),
      });
    });
  });

  describe('POST /checkout', () => {
    it.each(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'])('prevents a second subscription for a %s subscriber even when their tier is stale', async (status) => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user_123', stripeSubscriptionId: 'sub_existing',
        subscriptionStatus: status, subscriptionTier: 'FREE',
      });

      const res = await billingRoute.request('/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'team' }),
      });

      expect(res.status).toBe(400);
      expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
      expect(mockStripe.customers.create).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid plan', async () => {
      const req = new Request('http://localhost/checkout?plan=invalid', {
        method: 'POST',
      });
      const res = await billingRoute.request(req);
      expect(res.status).toBe(400);
    });
  });

  it('loads without billing credentials and reports unavailable checkout', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    jest.resetModules();
    const { billing } = await import('./billing.js');

    const response = await billing.request('/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'pro' }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Stripe not configured' });
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
});

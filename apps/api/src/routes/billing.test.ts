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
  organization: {
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
  default: jest.fn<any>(() => mockStripe),
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
      expect(mockPrisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org_1' },
        data: { subscriptionId: 'sub_team_123' }
      });
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
    it('should return 400 for invalid plan', async () => {
      const req = new Request('http://localhost/checkout?plan=invalid', {
        method: 'POST',
      });
      const res = await billingRoute.request(req);
      expect(res.status).toBe(400);
    });
  });
});

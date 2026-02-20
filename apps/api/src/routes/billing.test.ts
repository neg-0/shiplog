/// <reference types="jest" />
import { Hono } from 'hono';
import Stripe from 'stripe';

// Mock DB
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findMany: jest.fn(),
  },
  organization: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

// Mock Auth
jest.mock('../lib/auth.js', () => ({
  requireAuth: (c: any, next: any) => {
    c.set('user', { id: 'user_123' });
    return next();
  },
}));

// Mock DB module
jest.mock('../lib/db.js', () => ({
  prisma: mockPrisma,
}));

// Mock Stripe
const mockStripe = {
  customers: {
    list: jest.fn(),
    create: jest.fn(),
  },
  checkout: {
    sessions: {
      create: jest.fn(),
    },
  },
  billingPortal: {
    sessions: {
      create: jest.fn(),
    },
  },
  webhooks: {
    constructEvent: jest.fn(),
  },
  subscriptions: {
    retrieve: jest.fn(),
  },
};

jest.mock('stripe', () => {
  return jest.fn(() => mockStripe);
});


// Set Env Vars
const OLD_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
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
    const mod = await import('./billing.js');
    billingRoute = mod.billing;
    // Default mocks
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'user_123' }]);
    mockPrisma.organization.findMany.mockResolvedValue([]);
  });

  describe('Webhook: customer.subscription.updated', () => {
    it('should resolve TEAM tier from price ID', async () => {
      const event = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            status: 'active',
            items: { data: [{ price: { id: 'price_team_123' } }] },
          },
        },
      };

      (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(event);
      (mockStripe.subscriptions.retrieve as jest.Mock).mockResolvedValue({
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
        where: { stripeCustomerId: 'cus_123' },
        data: expect.objectContaining({
            subscriptionTier: 'TEAM',
        }),
      });
    });

    it('should resolve TEAM tier from lookup_key if ID mismatches but key is correct', async () => {
        // ID is random, but lookup_key is team_something
        const event = {
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: 'sub_123',
              customer: 'cus_123',
              status: 'active',
              items: { data: [{ price: { id: 'price_random' } }] },
            },
          },
        };

        (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(event);
        (mockStripe.subscriptions.retrieve as jest.Mock).mockResolvedValue({
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
          where: { stripeCustomerId: 'cus_123' },
          data: expect.objectContaining({
              subscriptionTier: 'TEAM',
          }),
        });
    });

    it('should fallback to FREE if price unknown', async () => {
        const event = {
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: 'sub_123',
              customer: 'cus_123',
              status: 'active',
              items: { data: [{ price: { id: 'price_unknown' } }] },
            },
          },
        };

        (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(event);
        (mockStripe.subscriptions.retrieve as jest.Mock).mockResolvedValue({
          id: 'sub_123',
          customer: 'cus_123',
          status: 'active',
          items: { data: [{ price: { id: 'price_unknown', lookup_key: null } }] },
        });

        const req = new Request('http://localhost/webhook', {
          method: 'POST',
          headers: { 'stripe-signature': 'sig_123' },
          body: 'raw_body',
        });
        const res = await billingRoute.request(req);

        expect(res.status).toBe(200);
        expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
          where: { stripeCustomerId: 'cus_123' },
          data: expect.objectContaining({
              subscriptionTier: 'FREE',
          }),
        });
    });

    it('should update Organization subscriptionId when upgrading to TEAM', async () => {
        // This test ensures Organization support is implemented
        const event = {
            type: 'customer.subscription.updated',
            data: {
              object: {
                id: 'sub_team_123',
                customer: 'cus_123',
                status: 'active',
                items: { data: [{ price: { id: 'price_team_123' } }] },
              },
            },
          };

          (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(event);
          (mockStripe.subscriptions.retrieve as jest.Mock).mockResolvedValue({
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

          // Check if organizations were updated
          expect(mockPrisma.organization.update).toHaveBeenCalledWith({
              where: { id: 'org_1' },
              data: { subscriptionId: 'sub_team_123' }
          });
    });

    it('should clear Organization subscriptionId when downgrading from TEAM to PRO', async () => {
        const event = {
            type: 'customer.subscription.updated',
            data: {
              object: {
                id: 'sub_pro_123',
                customer: 'cus_123',
                status: 'active',
                items: { data: [{ price: { id: 'price_pro_123' } }] },
              },
            },
          };

          (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(event);
          (mockStripe.subscriptions.retrieve as jest.Mock).mockResolvedValue({
            id: 'sub_pro_123',
            customer: 'cus_123',
            status: 'active',
            items: { data: [{ price: { id: 'price_pro_123', lookup_key: 'pro_monthly' } }] },
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

          // Check if organizations were updated to null
          expect(mockPrisma.organization.update).toHaveBeenCalledWith({
              where: { id: 'org_1' },
              data: { subscriptionId: null }
          });
    });
  });
});

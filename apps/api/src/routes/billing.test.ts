process.env.STRIPE_SECRET_KEY = 'sk_test_123';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123';
process.env.STRIPE_PRICE_PRO = 'price_pro';

import { billing } from './billing';
import { prisma } from '../lib/db';
import Stripe from 'stripe';

// Mock Prisma
jest.mock('../lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

// Mock Stripe
jest.mock('stripe', () => {
  return jest.fn(() => ({
    webhooks: {
      constructEvent: jest.fn(),
    },
    subscriptions: {
      retrieve: jest.fn(),
    },
    checkout: {
      sessions: {
        create: jest.fn(),
      }
    },
    billingPortal: {
      sessions: {
        create: jest.fn(),
      }
    },
    customers: {
      create: jest.fn(),
      list: jest.fn(),
    }
  }));
});

// Mock Auth Middleware
jest.mock('../lib/auth', () => ({
  requireAuth: async (c: any, next: any) => {
    c.set('user', { id: 'user_123' });
    await next();
  },
}));

describe('Billing Routes', () => {
  let mockStripe: any;

  beforeAll(() => {
    // Access the mock instance created when billing.ts was imported
    // The constructor returns the object we defined in the factory
    // We can get it from mock.results because new Stripe() calls the mock function
    const mockClass = Stripe as unknown as jest.Mock;
    if (mockClass.mock.results.length > 0) {
        mockStripe = mockClass.mock.results[0].value;
    } else {
        // Fallback if not instantiated yet (should not happen if billing.ts imports it)
        console.warn('Stripe not instantiated yet?');
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /webhook', () => {
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

      (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(event);
      (mockStripe.subscriptions.retrieve as jest.Mock).mockResolvedValue({
        id: 'sub_123',
        status: 'active',
        items: { data: [{ price: { id: 'price_pro' } }] },
      });

      const req = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_123' },
        body: JSON.stringify(event),
      });

      const res = await billing.request(req);
      expect(res.status).toBe(200);
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalled();

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
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

    it('should process customer.subscription.updated and use timestamp check', async () => {
       const event = {
        id: 'evt_new',
        type: 'customer.subscription.updated',
        created: 2000,
        data: {
          object: {
            id: 'sub_123',
          },
        },
      };

      (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(event);
      (mockStripe.subscriptions.retrieve as jest.Mock).mockResolvedValue({
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        items: { data: [{ price: { id: 'price_pro' } }] },
      });

      const req = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_123' },
        body: JSON.stringify(event),
      });

      await billing.request(req);

      expect(prisma.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({
          where: {
              stripeCustomerId: 'cus_123',
              OR: [
                  { stripeLastEventTimestamp: { lt: 2000 } },
                  { stripeLastEventTimestamp: null }
              ]
          },
          data: expect.objectContaining({
              stripeLastEventTimestamp: 2000,
          })
      }));
    });

    it('should fail with invalid signature', async () => {
       (mockStripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
           throw new Error('Invalid signature');
       });

       const req = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_invalid' },
        body: 'invalid',
      });

      const res = await billing.request(req);
      expect(res.status).toBe(400);
    });

    it('should return 500 if stripe retrieval fails', async () => {
        const event = {
            id: 'evt_123',
            type: 'customer.subscription.updated',
            created: 1000,
            data: { object: { id: 'sub_123' } },
        };
        (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(event);
        (mockStripe.subscriptions.retrieve as jest.Mock).mockRejectedValue(new Error('Stripe error'));

        const req = new Request('http://localhost/webhook', {
            method: 'POST',
            headers: { 'stripe-signature': 'sig_123' },
            body: JSON.stringify(event),
        });

        const res = await billing.request(req);
        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: 'Webhook processing failed' });
    });
  });

  describe('POST /checkout', () => {
      it('should return 400 for invalid plan', async () => {
          const req = new Request('http://localhost/checkout?plan=invalid', {
              method: 'POST',
          });
          const res = await billing.request(req);
          expect(res.status).toBe(400);
      });
  });
});

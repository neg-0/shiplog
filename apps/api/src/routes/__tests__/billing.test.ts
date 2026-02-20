import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockDeep } from 'jest-mock-extended';
import type { PrismaClient } from '@prisma/client';

// Define mocks
const prismaMock = mockDeep<PrismaClient>();
const stripeMock = {
  customers: {
    create: jest.fn(),
    list: jest.fn(),
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
  subscriptions: {
    retrieve: jest.fn(),
  },
  webhooks: {
    constructEvent: jest.fn(),
  },
};

// Mock dependencies
jest.unstable_mockModule('../../lib/db.js', () => ({
  prisma: prismaMock,
}));

jest.unstable_mockModule('../../lib/auth.js', () => ({
  requireAuth: async (c: any, next: any) => {
    c.set('user', {
      id: 'user_1',
      githubId: 12345,
      login: 'testuser',
      email: 'test@example.com',
    });
    await next();
  },
}));

jest.unstable_mockModule('stripe', () => ({
  default: jest.fn(() => stripeMock),
}));

// Import the app after mocking dependencies
const { billing } = await import('../billing');

describe('Billing Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /checkout', () => {
    it('should create a checkout session for a new customer', async () => {
      // Mock db user
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Test User',
        login: 'testuser',
        stripeCustomerId: null,
        githubId: 12345,
      } as any);

      // Mock Stripe customer list (no existing customer)
      (stripeMock.customers.list as jest.Mock).mockResolvedValue({
        data: [],
      } as any);

      // Mock Stripe customer creation
      (stripeMock.customers.create as jest.Mock).mockResolvedValue({
        id: 'cus_new',
      } as any);

      // Mock Stripe checkout session creation
      (stripeMock.checkout.sessions.create as jest.Mock).mockResolvedValue({
        url: 'https://checkout.stripe.com/session',
      } as any);

      const req = new Request('http://localhost/checkout?plan=pro', {
        method: 'POST',
      });
      const res = await billing.request(req);

      expect(res.status).toBe(200);
      const data = await res.json() as { url: string };
      expect(data).toEqual({ url: 'https://checkout.stripe.com/session' });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        select: expect.any(Object),
      });
      expect(stripeMock.customers.create).toHaveBeenCalled();
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        data: { stripeCustomerId: 'cus_new' },
      });
    });

    it('should handle existing customer', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Test User',
        login: 'testuser',
        stripeCustomerId: 'cus_existing',
        githubId: 12345,
      } as any);

      (stripeMock.checkout.sessions.create as jest.Mock).mockResolvedValue({
        url: 'https://checkout.stripe.com/session',
      } as any);

      const req = new Request('http://localhost/checkout?plan=pro', {
        method: 'POST',
      });
      const res = await billing.request(req);

      expect(res.status).toBe(200);
      expect(stripeMock.customers.create).not.toHaveBeenCalled();
      expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_existing',
        })
      );
    });

    it('should return error for invalid plan', async () => {
        const req = new Request('http://localhost/checkout?plan=invalid', {
            method: 'POST',
        });
        const res = await billing.request(req);
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'Invalid plan' });
    });
  });

  describe('POST /portal', () => {
    it('should create a portal session', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeCustomerId: 'cus_123',
      } as any);

      (stripeMock.billingPortal.sessions.create as jest.Mock).mockResolvedValue({
        url: 'https://billing.stripe.com/session',
      } as any);

      const req = new Request('http://localhost/portal', {
        method: 'POST',
      });
      const res = await billing.request(req);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ url: 'https://billing.stripe.com/session' });
    });

    it('should return error if no stripe customer', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeCustomerId: null,
      } as any);

      const req = new Request('http://localhost/portal', {
        method: 'POST',
      });
      const res = await billing.request(req);

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'No Stripe customer found' });
    });
  });

  describe('POST /webhook', () => {
    it('should handle checkout.session.completed', async () => {
      const event = {
        type: 'checkout.session.completed',
        data: {
          object: {
            customer: 'cus_123',
            subscription: 'sub_123',
            metadata: { userId: 'user_1' },
          },
        },
      };

      (stripeMock.webhooks.constructEvent as jest.Mock).mockReturnValue(event);

      (stripeMock.subscriptions.retrieve as jest.Mock).mockResolvedValue({
        id: 'sub_123',
        status: 'active',
        items: {
          data: [{ price: { id: 'price_pro' } }],
        },
        customer: 'cus_123',
      } as any);

      const req = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig' },
        body: JSON.stringify(event),
      });
      const res = await billing.request(req);

      expect(res.status).toBe(200);
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        data: expect.objectContaining({
          subscriptionTier: 'PRO', // assuming default behavior for price_pro
          stripeSubscriptionId: 'sub_123',
        }),
      });
    });

    it('should handle customer.subscription.updated', async () => {
        const event = {
            type: 'customer.subscription.updated',
            data: {
                object: {
                    id: 'sub_123',
                    customer: 'cus_123',
                    status: 'active',
                }
            }
        };

        (stripeMock.webhooks.constructEvent as jest.Mock).mockReturnValue(event);

        (stripeMock.subscriptions.retrieve as jest.Mock).mockResolvedValue({
            id: 'sub_123',
            status: 'active',
            customer: 'cus_123',
            items: {
                data: [{ price: { id: 'price_team' } }],
            },
        } as any);

        const req = new Request('http://localhost/webhook', {
            method: 'POST',
            headers: { 'stripe-signature': 'sig' },
            body: JSON.stringify(event),
        });
        const res = await billing.request(req);

        expect(res.status).toBe(200);
        expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
            where: { stripeCustomerId: 'cus_123' },
            data: expect.objectContaining({
                subscriptionTier: 'TEAM',
            }),
        });
    });

    it('should handle customer.subscription.deleted', async () => {
        const event = {
            type: 'customer.subscription.deleted',
            data: {
                object: {
                    id: 'sub_123',
                    customer: 'cus_123',
                    status: 'canceled',
                }
            }
        };

        (stripeMock.webhooks.constructEvent as jest.Mock).mockReturnValue(event);

        (stripeMock.subscriptions.retrieve as jest.Mock).mockResolvedValue({
            id: 'sub_123',
            status: 'canceled',
            customer: 'cus_123',
            items: {
                data: [{ price: { id: 'price_pro' } }],
            },
        } as any);

        const req = new Request('http://localhost/webhook', {
            method: 'POST',
            headers: { 'stripe-signature': 'sig' },
            body: JSON.stringify(event),
        });
        const res = await billing.request(req);

        expect(res.status).toBe(200);
        expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
            where: { stripeCustomerId: 'cus_123' },
            data: expect.objectContaining({
                subscriptionTier: 'FREE',
                subscriptionStatus: 'canceled',
            }),
        });
    });

    it('should handle invoice.payment_failed (ignore)', async () => {
        const event = {
            type: 'invoice.payment_failed',
            data: {
                object: {
                    customer: 'cus_123',
                }
            }
        };

        (stripeMock.webhooks.constructEvent as jest.Mock).mockReturnValue(event);

        const req = new Request('http://localhost/webhook', {
            method: 'POST',
            headers: { 'stripe-signature': 'sig' },
            body: JSON.stringify(event),
        });
        const res = await billing.request(req);

        expect(res.status).toBe(200);
        expect(prismaMock.user.update).not.toHaveBeenCalled();
        expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
    });

    it('should return error for invalid signature', async () => {
        (stripeMock.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
            throw new Error('Invalid signature');
        });

        const req = new Request('http://localhost/webhook', {
            method: 'POST',
            headers: { 'stripe-signature': 'invalid' },
            body: 'rawbody',
        });
        const res = await billing.request(req);

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'Invalid signature' });
    });
  });
});

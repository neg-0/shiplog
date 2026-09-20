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
  $queryRaw: jest.fn<any>(),
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
      list: jest.fn<any>(),
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
    list: jest.fn<any>(),
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
  let accountDeletionBillingBlock: typeof import('./billing.js').accountDeletionBillingBlock;

  beforeEach(async () => {
    jest.resetModules();
    const mod = await import('./billing.js');
    billingRoute = mod.billing;
    accountDeletionBillingBlock = mod.accountDeletionBillingBlock;
    mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockPrisma));
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'user_123' }]);
    mockPrisma.organization.findMany.mockResolvedValue([]);
  });


  describe('Account deletion billing verification', () => {
    beforeEach(() => {
      mockStripe.checkout.sessions.list.mockReset().mockResolvedValue({ data: [], has_more: false });
      mockStripe.subscriptions.list.mockReset().mockResolvedValue({ data: [], has_more: false });
    });

    it('blocks an open checkout before considering stale local subscription state', async () => {
      mockStripe.checkout.sessions.list.mockResolvedValue({ data: [{ id: 'cs_open' }] });
      expect(await accountDeletionBillingBlock('cus_123')).toMatchObject({ status: 409, error: expect.stringContaining('checkout') });
      expect(mockStripe.subscriptions.list).not.toHaveBeenCalled();
    });

    it.each(['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'])('blocks a provider %s subscription even if the webhook has not arrived', async status => {
      mockStripe.subscriptions.list.mockResolvedValue({ data: [{ id: 'sub_pending', status }], has_more: false });
      expect(await accountDeletionBillingBlock('cus_123')).toMatchObject({ status: 409, error: expect.stringContaining('subscription') });
    });

    it('checks all subscription pages and catches a later active subscription', async () => {
      mockStripe.subscriptions.list.mockResolvedValueOnce({ data: [{ id: 'sub_old', status: 'canceled' }], has_more: true })
        .mockResolvedValueOnce({ data: [{ id: 'sub_active', status: 'active' }], has_more: false });
      expect(await accountDeletionBillingBlock('cus_123')).toMatchObject({ status: 409 });
      expect(mockStripe.subscriptions.list).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ customer: 'cus_123', status: 'all', starting_after: 'sub_old' }), expect.anything());
    });

    it('permits deletion after authoritative confirmation of ended subscriptions and no checkout', async () => {
      mockStripe.subscriptions.list.mockResolvedValue({ data: [{ id: 'sub_1', status: 'canceled' }, { id: 'sub_2', status: 'incomplete_expired' }], has_more: false });
      expect(await accountDeletionBillingBlock('cus_123')).toBeNull();
      expect(mockStripe.checkout.sessions.list.mock.invocationCallOrder[0]).toBeLessThan(mockStripe.subscriptions.list.mock.invocationCallOrder[0]);
    });

    it.each(['checkout', 'subscriptions'])('fails closed when the %s verification request fails', async request => {
      (request === 'checkout' ? mockStripe.checkout.sessions.list : mockStripe.subscriptions.list).mockRejectedValue(new Error('Stripe unavailable'));
      expect(await accountDeletionBillingBlock('cus_123')).toMatchObject({ status: 503 });
    });
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
    beforeEach(() => {
      mockStripe.checkout.sessions.list.mockReset().mockResolvedValue({ data: [], has_more: false });
      mockStripe.subscriptions.list.mockReset().mockResolvedValue({ data: [], has_more: false });
    });

    const newCustomer = () => ({
      id: 'user_123', email: 'user@example.com', name: 'User', login: 'user', githubId: 123,
      stripeCustomerId: null as string | null, stripeSubscriptionId: null, subscriptionStatus: null,
    });
    const checkoutRequest = () => billingRoute.request('/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: 'pro' }),
    });

    it('creates no checkout if committing the customer identity fails', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(newCustomer());
      mockStripe.customers.list.mockResolvedValue({ data: [] });
      mockStripe.customers.create.mockResolvedValue({ id: 'cus_new' });
      mockPrisma.$transaction.mockImplementationOnce(async callback => {
        await callback(mockPrisma);
        throw new Error('Customer commit failed');
      });
      expect((await checkoutRequest()).status).toBe(500);
      expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it('preserves committed customer custody when the later checkout transaction fails', async () => {
      let savedUser = newCustomer();
      mockPrisma.user.findUnique.mockImplementation(async () => savedUser);
      mockPrisma.user.update.mockImplementation(async args => {
        savedUser = { ...savedUser, ...args.data };
        return savedUser;
      });
      mockStripe.customers.list.mockResolvedValue({ data: [] });
      mockStripe.customers.create.mockResolvedValue({ id: 'cus_durable' });
      mockStripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_open', url: 'https://checkout.stripe.test/session' });
      let transactions = 0;
      mockPrisma.$transaction.mockImplementation(async callback => {
        const phase = ++transactions;
        const result = await callback(mockPrisma);
        if (phase === 2) throw new Error('Checkout transaction failed');
        return result;
      });
      expect((await checkoutRequest()).status).toBe(500);
      expect(savedUser.stripeCustomerId).toBe('cus_durable');
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_durable' }), expect.anything());
      mockStripe.checkout.sessions.list.mockResolvedValue({ data: [{ id: 'cs_open', client_reference_id: 'user_123', metadata: { plan: 'PRO' }, url: 'https://checkout.stripe.test/session' }] });
      expect(await accountDeletionBillingBlock(savedUser.stripeCustomerId!)).toMatchObject({ status: 409 });
      expect((await checkoutRequest()).status).toBe(200);
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
    });

    it('never adopts a customer merely because its email matches', async () => {
      let savedUser = newCustomer();
      mockPrisma.user.findUnique.mockImplementation(async () => savedUser);
      mockPrisma.user.update.mockImplementation(async args => {
        savedUser = { ...savedUser, ...args.data };
        return savedUser;
      });
      mockStripe.customers.list.mockResolvedValue({ data: [{ id: 'cus_other_account' }] });
      mockStripe.customers.create.mockResolvedValue({ id: 'cus_own' });
      mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.test/own' });

      expect((await checkoutRequest()).status).toBe(200);
      expect(mockStripe.customers.list).not.toHaveBeenCalled();
      expect(savedUser.stripeCustomerId).toBe('cus_own');
      expect(mockStripe.customers.create).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { userId: 'user_123', githubId: '123' } }),
        expect.objectContaining({ idempotencyKey: 'shiplog-customer-user_123-initial' }),
      );
    });

    it('resumes the same checkout on a repeated request without creating another session', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...newCustomer(), stripeCustomerId: 'cus_existing' });
      const session = { id: 'cs_existing', status: 'open', client_reference_id: 'user_123', metadata: { plan: 'PRO' }, url: 'https://checkout.stripe.test/existing' };
      mockStripe.checkout.sessions.create.mockImplementation(async () => {
        mockStripe.checkout.sessions.list.mockResolvedValue({ data: [session] });
        return session;
      });
      const first = await checkoutRequest();
      const second = await checkoutRequest();
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual(await first.json());
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
    });

    it.each([
      { client_reference_id: 'other_user', metadata: { plan: 'PRO' } },
      { client_reference_id: 'user_123', metadata: { plan: 'TEAM' } },
    ])('blocks an open checkout that cannot safely resume for this request', async ownership => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...newCustomer(), stripeCustomerId: 'cus_existing' });
      mockStripe.checkout.sessions.list.mockResolvedValue({ data: [{ id: 'cs_other', url: 'https://checkout.stripe.test/other', ...ownership }] });
      expect((await checkoutRequest()).status).toBe(409);
      expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it.each([false, true])('blocks an active provider subscription with stale local state (open checkout: %s)', async hasOpenCheckout => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...newCustomer(), stripeCustomerId: 'cus_existing' });
      if (hasOpenCheckout) mockStripe.checkout.sessions.list.mockResolvedValue({ data: [{ id: 'cs_legacy', client_reference_id: 'user_123', metadata: { plan: 'PRO' }, url: 'https://checkout.stripe.test/legacy' }] });
      mockStripe.subscriptions.list.mockResolvedValue({ data: [{ id: 'sub_not_synced', status: 'trialing' }], has_more: false });
      expect((await checkoutRequest()).status).toBe(409);
      expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it.each(['checkout', 'subscriptions'])('creates no session when provider %s verification fails', async request => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...newCustomer(), stripeCustomerId: 'cus_existing' });
      (request === 'checkout' ? mockStripe.checkout.sessions.list : mockStripe.subscriptions.list).mockRejectedValue(new Error('Stripe unavailable'));
      expect((await checkoutRequest()).status).toBe(500);
      expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it('keeps the key after an uncertain create so Stripe rejects a conflicting plan change', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...newCustomer(), stripeCustomerId: 'cus_existing' });
      mockStripe.checkout.sessions.create.mockReset().mockRejectedValueOnce(new Error('Connection lost'))
        .mockRejectedValueOnce(new Error('Idempotency key cannot be reused with different parameters'));
      expect((await checkoutRequest()).status).toBe(500);
      const retry = await billingRoute.request('/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: 'team' }),
      });
      expect(retry.status).toBe(500);
      const keys = mockStripe.checkout.sessions.create.mock.calls.map(call => call[1].idempotencyKey);
      expect(keys).toEqual(['shiplog-checkout-cus_existing-initial', 'shiplog-checkout-cus_existing-initial']);
    });

    it('advances checkout idempotency only after an earlier session has ended', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...newCustomer(), stripeCustomerId: 'cus_existing' });
      mockStripe.checkout.sessions.list.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: [{ id: 'cs_expired', status: 'expired' }] });
      mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.test/new' });
      expect((await checkoutRequest()).status).toBe(200);
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ idempotencyKey: 'shiplog-checkout-cus_existing-cs_expired' }));
    });

    it('creates no checkout when the account was deleted between preparation and session creation', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ ...newCustomer(), stripeCustomerId: 'cus_existing' }).mockResolvedValue(null);
      expect((await checkoutRequest()).status).toBe(404);
      expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
    });

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
    const { billing, accountDeletionBillingBlock: verifyDeletion } = await import('./billing.js');

    const response = await billing.request('/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'pro' }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Stripe not configured' });
    expect(await verifyDeletion('cus_unverified')).toMatchObject({ status: 503 });
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
});

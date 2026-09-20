import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockDeep } from 'jest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';

const prismaMock = mockDeep<PrismaClient>();
const mockUser = {
  id: 'user-1',
  githubId: 123,
  login: 'testuser',
  email: 'test@example.com',
};

jest.unstable_mockModule('../lib/db.js', () => ({
  prisma: prismaMock,
}));

jest.unstable_mockModule('../lib/auth.js', () => ({
  requireAuth: jest.fn<any>(async (c: any, next: any) => {
    c.set('user', mockUser);
    await next();
  }),
}));

const billingBlock = jest.fn<any>();
jest.unstable_mockModule('./billing.js', () => ({ accountDeletionBillingBlock: billingBlock }));

const { user } = await import('./user.js');

describe('User Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/', user);
    jest.clearAllMocks();
    billingBlock.mockReset().mockResolvedValue(null);
  });

  describe('GET /me', () => {
    it('should return current user info', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUser.id,
        login: mockUser.login,
        name: 'Test User',
        email: mockUser.email,
        _count: { repos: 5 }
      } as any);

      const res = await app.request('/me');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe(mockUser.id);
      expect(data.repoCount).toBe(5);
    });

    it('should return 404 if user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const res = await app.request('/me');

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /me', () => {
    it('should update user profile', async () => {
      prismaMock.user.update.mockResolvedValue({ id: mockUser.id } as any);

      const res = await app.request('/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Name' }),
      });

      expect(res.status).toBe(200);
      expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: mockUser.id },
        data: { name: 'New Name' }
      }));
    });
  });

  describe('DELETE /me', () => {
    beforeEach(() => {
      prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
      prismaMock.user.findUnique.mockResolvedValue({
        stripeSubscriptionId: null, subscriptionStatus: null,
        _count: { ownedOrganizations: 0, repos: 0 },
      } as any);
    });

    it('should delete user account', async () => {
      prismaMock.user.delete.mockResolvedValue({ id: mockUser.id } as any);

      const res = await app.request('/me', { method: 'DELETE' });

      expect(res.status).toBe(200);
      expect(prismaMock.user.delete).toHaveBeenCalledWith({
        where: { id: mockUser.id }
      });
      expect(prismaMock.organizationInvite.deleteMany).toHaveBeenCalledWith({
        where: { invitedById: mockUser.id },
      });
      expect(res.headers.get('Set-Cookie')).toContain('shiplog_session=');
      expect(res.headers.get('Set-Cookie')).toContain('shiplog_logged_in=');
      expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
    });

    it('requires repository disconnection before deleting webhook custody', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeSubscriptionId: null, subscriptionStatus: null,
        _count: { ownedOrganizations: 0, repos: 1 },
      } as any);
      const res = await app.request('/me', { method: 'DELETE' });
      expect(res.status).toBe(409);
      expect((await res.json()).error).toContain('Disconnect your repositories');
      expect(prismaMock.user.delete).not.toHaveBeenCalled();
    });

    it.each(['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'])('refuses to orphan a %s subscription', async (status) => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeSubscriptionId: 'sub_live', subscriptionStatus: status,
        _count: { ownedOrganizations: 0 },
      } as any);

      const res = await app.request('/me', { method: 'DELETE' });

      expect(res.status).toBe(409);
      expect((await res.json()).error).toContain('billing portal');
      expect(prismaMock.user.delete).not.toHaveBeenCalled();
      expect(prismaMock.organizationInvite.deleteMany).not.toHaveBeenCalled();
    });

    it('allows deletion once a subscription has finished cancellation', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeCustomerId: 'cus_canceled', stripeSubscriptionId: 'sub_canceled', subscriptionStatus: 'canceled',
        _count: { ownedOrganizations: 0 },
      } as any);

      const res = await app.request('/me', { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(prismaMock.user.delete).toHaveBeenCalled();
    });

    it('explains how an organization owner can resolve blocked deletion', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeSubscriptionId: null, subscriptionStatus: null,
        _count: { ownedOrganizations: 1 },
      } as any);

      const res = await app.request('/me', { method: 'DELETE' });

      expect(res.status).toBe(409);
      expect((await res.json()).error).toContain('organization');
      expect(prismaMock.user.delete).not.toHaveBeenCalled();
      expect(prismaMock.organizationInvite.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('Account deletion verifies provider billing', () => {
    beforeEach(() => {
      prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
      prismaMock.user.findUnique.mockResolvedValue({
        stripeCustomerId: 'cus_pending', stripeSubscriptionId: null, subscriptionStatus: null,
        _count: { ownedOrganizations: 0, repos: 0 },
      } as any);
    });

    it('refuses deletion when a checkout remains open even without a locally recorded subscription', async () => {
      billingBlock.mockResolvedValue({ error: 'An unfinished checkout is still open.', status: 409 });
      const res = await app.request('/me', { method: 'DELETE' });
      expect(res.status).toBe(409);
      expect(billingBlock).toHaveBeenCalledWith('cus_pending');
      expect(prismaMock.user.delete).not.toHaveBeenCalled();
      expect(prismaMock.organizationInvite.deleteMany).not.toHaveBeenCalled();
      expect(res.headers.get('Set-Cookie')).toBeNull();
    });

    it('fails safely when subscription history has lost its customer identity', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeSubscriptionId: 'sub_old', subscriptionStatus: 'canceled', stripeCustomerId: null,
        _count: { ownedOrganizations: 0, repos: 0 },
      } as any);
      const res = await app.request('/me', { method: 'DELETE' });
      expect(res.status).toBe(503);
      expect(prismaMock.user.delete).not.toHaveBeenCalled();
    });

    it('fails safely when Stripe verification is unavailable', async () => {
      billingBlock.mockResolvedValue({ error: 'Billing verification is temporarily unavailable.', status: 503 });
      const res = await app.request('/me', { method: 'DELETE' });
      expect(res.status).toBe(503);
      expect(prismaMock.user.delete).not.toHaveBeenCalled();
    });

    it('deletes only after locking the account and verifying billing is closed', async () => {
      const res = await app.request('/me', { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(prismaMock.$queryRaw).toHaveBeenCalled();
      expect(prismaMock.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(billingBlock.mock.invocationCallOrder[0]);
      expect(billingBlock.mock.invocationCallOrder[0]).toBeLessThan(prismaMock.user.delete.mock.invocationCallOrder[0]);
    });
  });

});

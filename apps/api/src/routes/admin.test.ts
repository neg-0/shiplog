import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mockDeep } from 'jest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';

const prismaMock = mockDeep<PrismaClient>();
const requireAuthMock = jest.fn<any>();

jest.unstable_mockModule('../lib/db.js', () => ({ prisma: prismaMock }));
jest.unstable_mockModule('../lib/auth.js', () => ({ requireAuth: requireAuthMock }));

const { admin } = await import('./admin.js');

const adminUser = { id: 'admin-1', githubId: 123, login: 'admin', email: 'admin@example.com' };
const regularUser = { id: 'user-1', githubId: 456, login: 'user', email: 'user@example.com' };

function mockMetrics() {
  prismaMock.user.count
    .mockResolvedValueOnce(100) // total
    .mockResolvedValueOnce(50)  // free
    .mockResolvedValueOnce(30)  // pro
    .mockResolvedValueOnce(20)  // team
    .mockResolvedValueOnce(8)   // new
    .mockResolvedValueOnce(14)  // active paid plan records
    .mockResolvedValueOnce(3)   // trials
    .mockResolvedValueOnce(2)   // past due
    .mockResolvedValueOnce(1);  // paid tier without Stripe subscription
  prismaMock.repo.count.mockResolvedValueOnce(500).mockResolvedValueOnce(450).mockResolvedValueOnce(2);
  prismaMock.release.count.mockResolvedValueOnce(200).mockResolvedValueOnce(12).mockResolvedValueOnce(4).mockResolvedValueOnce(1);
  prismaMock.organization.count.mockResolvedValue(7);
  prismaMock.distribution.count.mockResolvedValueOnce(25).mockResolvedValueOnce(3);
  prismaMock.generatedNotes.aggregate.mockResolvedValue({ _count: { id: 11 }, _sum: { tokensUsed: 1200 } } as any);
  prismaMock.generatedNotes.count.mockResolvedValue(2);
}

describe('Admin Routes', () => {
  let app: Hono;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_EMAILS = 'admin@example.com';
    app = new Hono();
    app.route('/', admin);
    requireAuthMock.mockImplementation(async (c: any, next: any) => { c.set('user', adminUser); await next(); });
  });

  afterEach(() => { delete process.env.ADMIN_EMAILS; });

  it('requires an admin email', async () => {
    requireAuthMock.mockImplementation(async (c: any, next: any) => { c.set('user', regularUser); await next(); });
    const response = await app.request('/metrics');
    expect(response.status).toBe(403);
    expect(prismaMock.user.count).not.toHaveBeenCalled();
  });

  it('returns grounded operational metrics without presenting estimated prices as revenue', async () => {
    mockMetrics();
    const response = await app.request('/metrics');
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const data = await response.json();
    expect(data.users).toEqual({ total: 100, free: 50, pro: 30, team: 20, new: 8 });
    expect(data.repos).toEqual({ total: 500, active: 450, error: 2 });
    expect(data.releases).toEqual({ total: 200, new: 12, needingAttention: 4, stuckProcessing: 1 });
    expect(data.deliveries).toEqual({ sentExternal: 25, failedExternalAttempts: 3 });
    expect(data.ai).toEqual({ savedDrafts: 11, recordedTokens: 1200, missingTokenCounts: 2 });
    expect(data.billing.activePaidPlanRecords).toBe(14);
    expect(data.billing.collectedRevenue).toBeNull();
    expect(data.billing.mrr).toBeNull();
    expect(data.mrr).toBeUndefined();
    expect(prismaMock.distribution.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ hostedChangelog: false }) }));
  });

  it('lists users with release and external send counts while keeping Stripe IDs private', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'u1', login: 'u1', name: null, email: 'u1@example.com', avatarUrl: null, subscriptionTier: 'PRO', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_private', trialEndsAt: null, createdAt: new Date('2026-01-01'), _count: { repos: 2 } }] as any);
    prismaMock.user.count.mockResolvedValue(1);
    (prismaMock.$queryRaw as any).mockResolvedValue([{ userId: 'u1', releaseCount: BigInt(4), externalDeliveryCount: BigInt(9) }]);

    const response = await app.request('/users?page=1&limit=10&search=test&tier=PRO');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.users[0]).toMatchObject({ id: 'u1', repoCount: 2, releaseCount: 4, externalDeliveryCount: 9, hasStripeSubscription: true });
    expect(JSON.stringify(data)).not.toContain('sub_private');
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.arrayContaining([{ email: { contains: 'test', mode: 'insensitive' } }]), subscriptionTier: 'PRO' }),
      skip: 0,
      take: 10,
    }));
  });

  it('does not run a count query for an empty user page', async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);
    const response = await app.request('/users');
    expect(response.status).toBe(200);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('reads an individual user or returns 404', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1', login: 'u1', repos: [] } as any).mockResolvedValueOnce(null);
    expect((await app.request('/users/u1')).status).toBe(200);
    expect((await app.request('/users/missing')).status).toBe(404);
  });

  it('blocks direct plan edits and deletion before any database mutation', async () => {
    const patch = await app.request('/users/u1', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscriptionTier: 'PRO' }) });
    const deletion = await app.request('/users/u1', { method: 'DELETE' });
    expect(patch.status).toBe(409);
    expect((await patch.json()).error).toContain('Stripe');
    expect(deletion.status).toBe(409);
    expect((await deletion.json()).error).toContain('billing and webhook cleanup');
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it('shows organization ownership, membership and subscription warnings without secret IDs', async () => {
    prismaMock.organization.findMany.mockResolvedValue([{ id: 'o1', name: 'Acme', slug: 'acme', ownerId: 'u1', subscriptionId: 'sub_old', createdAt: new Date('2026-01-01'), owner: { id: 'u1', login: 'alice', email: 'alice@example.com', subscriptionTier: 'FREE', subscriptionStatus: 'canceled', stripeSubscriptionId: 'sub_new' }, members: [{ role: 'MEMBER', user: { id: 'u2', login: 'bob', email: 'bob@example.com' } }], _count: { members: 1, repos: 2 } }] as any);
    prismaMock.organization.count.mockResolvedValue(1);
    const response = await app.request('/organizations?search=acme');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.organizations[0]).toMatchObject({ owner: { login: 'alice' }, memberCount: 1, repoCount: 2 });
    expect(data.organizations[0].warnings).toHaveLength(3);
    expect(JSON.stringify(data)).not.toContain('sub_old');
    expect(JSON.stringify(data)).not.toContain('sub_new');
  });

  it('includes external delivery attempts in recent activity', async () => {
    const now = new Date('2026-01-01');
    prismaMock.user.findMany.mockResolvedValue([{ id: 'u1', login: 'u1', email: 'u1@example.com', subscriptionTier: 'FREE', createdAt: now }] as any);
    prismaMock.release.findMany.mockResolvedValue([{ id: 'r1', tagName: 'v1.0', createdAt: now, repo: { name: 'repo', fullName: 'u1/repo', user: { login: 'u1' } } }] as any);
    prismaMock.distribution.findMany.mockResolvedValue([{ id: 'd1', status: 'FAILED', createdAt: now, release: { tagName: 'v1.0', repo: { fullName: 'u1/repo' } } }] as any);
    const response = await app.request('/activity');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.events).toHaveLength(3);
    expect(data.events.some((event: any) => event.type === 'delivery')).toBe(true);
    expect(prismaMock.distribution.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { hostedChangelog: false, status: { in: ['SENT', 'FAILED'] } } }));
  });
});

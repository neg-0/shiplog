import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';

jest.unstable_mockModule('../lib/db.js', () => ({
  __esModule: true,
  prisma: mockDeep<PrismaClient>(),
}));

jest.unstable_mockModule('../lib/auth.js', () => ({
  requireAuth: async (c: any, next: any) => {
    c.set('user', { id: 'test-user-id' });
    await next();
  },
  decrypt: jest.fn().mockResolvedValue('decrypted-access-token'),
}));

jest.unstable_mockModule('../services/github.js', () => ({
  fetchReleaseData: jest.fn(),
}));

jest.unstable_mockModule('../services/generator.js', () => ({
  generateReleaseNotes: jest.fn(),
}));

jest.unstable_mockModule('../services/publisher.js', () => ({
  publishReleaseNotes: jest.fn(),
}));

jest.unstable_mockModule('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (s: string) => s },
}));

jest.unstable_mockModule('../lib/sanitize.js', () => ({
  sanitizeHtml: (s: string) => s,
}));

jest.unstable_mockModule('../lib/rate-limit.js', () => ({
  apiLimiter: async (_c: any, next: any) => { await next(); },
  rateLimit: () => async (_c: any, next: any) => { await next(); },
}));

describe('Releases Routes', () => {
  let releases: any;
  let prismaMock: DeepMockProxy<PrismaClient>;
  let githubService: any;
  let generatorService: any;
  let publisherService: any;

  beforeEach(async () => {
    jest.resetModules();

    const db = await import('../lib/db.js');
    prismaMock = db.prisma as unknown as DeepMockProxy<PrismaClient>;

    githubService = await import('../services/github.js');
    generatorService = await import('../services/generator.js');
    publisherService = await import('../services/publisher.js');

    const module = await import('../routes/releases.js');
    releases = module.releases;

    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
  });

  describe('GET /:id', () => {
    it('returns release detail', async () => {
      prismaMock.release.findFirst.mockResolvedValue({
        id: 'rel-1',
        repo: { id: 'repo-1', userId: 'test-user-id', isPublic: false, slug: 'repo-123', user: { subscriptionTier: 'FREE' } },
        notes: { customer: 'notes' },
      } as any);

      const res = await releases.request('/rel-1');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe('rel-1');
      expect(data.notes.customer).toBe('notes');
      expect(data.repo).toMatchObject({ isPublic: false, slug: 'repo-123', entitlements: { automation: false, channels: false } });
    });

    it('returns 404 if unauthorized (access filter in WHERE clause)', async () => {
      // Route embeds access check in the query - unauthorized releases are not found
      prismaMock.release.findFirst.mockResolvedValue(null);

      const res = await releases.request('/rel-1');
      expect(res.status).toBe(404);
    });

    it('returns 404 if not found', async () => {
      prismaMock.release.findFirst.mockResolvedValue(null);
      const res = await releases.request('/non-existent');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /:id/regenerate', () => {
    it('regenerates notes', async () => {
      prismaMock.release.findFirst.mockResolvedValue({
        id: 'rel-1',
        tagName: 'v1.0.0', status: 'SKIPPED', error: null, updatedAt: new Date(),
        repo: {
          userId: 'test-user-id',
          owner: 'owner',
          name: 'repo',
          user: { accessToken: 'enc-token', subscriptionTier: 'FREE' }
        },
      } as any);

      githubService.fetchReleaseData.mockResolvedValue({
        release: { tagName: 'v1.0.0', body: 'body' },
        commits: [],
        pullRequests: [],
      });

      generatorService.generateReleaseNotes.mockResolvedValue({
        customer: 'new notes',
        tokensUsed: 100,
        model: 'gpt-4',
      });

      prismaMock.release.update.mockResolvedValue({} as any);
      prismaMock.generatedNotes.upsert.mockResolvedValue({} as any);
      prismaMock.release.updateMany.mockResolvedValue({ count: 1 });

      const res = await releases.request('/rel-1/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tone: 'friendly' }),
      });

      expect(res.status).toBe(200);
      expect(githubService.fetchReleaseData).toHaveBeenCalled();
      expect(generatorService.generateReleaseNotes).toHaveBeenCalled();
      expect(prismaMock.release.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'READY', notes: { upsert: expect.anything() } }) }));
    });
  });

  describe('POST /:id/publish', () => {
    it('publishes release', async () => {
      prismaMock.release.findFirst.mockResolvedValue({
        id: 'rel-1',
        repo: { userId: 'test-user-id', fullName: 'owner/repo' },
        status: 'READY', publishedAt: new Date(), isDraft: false,
        notes: { id: 'notes-1' },
      } as any);

      prismaMock.release.update.mockResolvedValue({} as any);
      prismaMock.release.updateMany.mockResolvedValue({ count: 1 });
      publisherService.publishReleaseNotes.mockResolvedValue({ status: 'PUBLISHED', failedCount: 0, distributedTo: 3 });

      const res = await releases.request('/rel-1/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: [] }),
      });

      expect(res.status).toBe(200);
      expect(publisherService.publishReleaseNotes).toHaveBeenCalledWith(expect.objectContaining({ id: 'rel-1' }), [], expect.stringContaining(':publication:READY:'));
    });

    it('fails if no notes', async () => {
      prismaMock.release.findFirst.mockResolvedValue({
        id: 'rel-1',
        repo: { userId: 'test-user-id' },
        notes: null,
      } as any);

      const res = await releases.request('/rel-1/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /:id/notes', () => {
    it('updates generated notes', async () => {
      prismaMock.release.findFirst.mockResolvedValue({
        id: 'rel-1',
        repo: { userId: 'test-user-id' },
        status: 'READY', error: null, updatedAt: new Date(), publishedAt: new Date(), isDraft: false,
        notes: { id: 'notes-1' },
      } as any);

      prismaMock.release.updateMany.mockResolvedValue({ count: 1 });
      const res = await releases.request('/rel-1/notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer: 'edited notes' }),
      });

      expect(res.status).toBe(200);
      expect(prismaMock.generatedNotes.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { releaseId: 'rel-1' },
          data: expect.objectContaining({ customer: 'edited notes', customerEdited: true }),
        })
      );
    });
  });

  it('rejects a draft even when generated notes exist', async () => {
    prismaMock.release.findFirst.mockResolvedValue({
      id: 'rel-1', isDraft: true, publishedAt: null, status: 'READY', notes: { customer: 'Draft' }, repo: { config: null },
    } as any);
    const response = await releases.request('/rel-1/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(response.status).toBe(400);
    expect(publisherService.publishReleaseNotes).not.toHaveBeenCalled();
  });

  it('rejects channels belonging to another repository without sending', async () => {
    prismaMock.release.findFirst.mockResolvedValue({
      id: 'rel-1', isDraft: false, publishedAt: new Date(), status: 'READY', notes: {}, repo: { config: { channels: [] } },
    } as any);
    const response = await releases.request('/rel-1/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channels: ['other-channel'] }) });
    expect(response.status).toBe(400);
    expect(publisherService.publishReleaseNotes).not.toHaveBeenCalled();
  });

  it('does not send if another publish request has already claimed the release', async () => {
    prismaMock.release.findFirst.mockResolvedValue({
      id: 'rel-1', isDraft: false, publishedAt: new Date(), status: 'READY', notes: {}, repo: { config: null },
    } as any);
    prismaMock.release.updateMany.mockResolvedValue({ count: 0 });
    const response = await releases.request('/rel-1/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(response.status).toBe(409);
    expect(publisherService.publishReleaseNotes).not.toHaveBeenCalled();
  });

  it('returns partial delivery failures to the client', async () => {
    prismaMock.release.findFirst.mockResolvedValue({
      id: 'rel-1', isDraft: false, publishedAt: new Date(), status: 'READY', notes: {}, repo: { config: null },
    } as any);
    prismaMock.release.updateMany.mockResolvedValue({ count: 1 });
    publisherService.publishReleaseNotes.mockResolvedValue({ status: 'PARTIAL_SUCCESS', failedCount: 1, distributedTo: 3 });
    const response = await releases.request('/rel-1/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(await response.json()).toMatchObject({ status: 'partial_success', failedCount: 1, distributedTo: 3 });
  });


  it('keeps previously published notes public when regeneration fails', async () => {
    prismaMock.release.findFirst.mockResolvedValue({
      id: 'rel-1', status: 'PUBLISHED', tagName: 'v1.0', repo: { owner: 'owner', name: 'repo', user: { accessToken: 'encrypted' } },
    } as any);
    prismaMock.release.updateMany.mockResolvedValue({ count: 1 });
    githubService.fetchReleaseData.mockRejectedValue(new Error('GitHub temporarily unavailable'));
    const response = await releases.request('/rel-1/regenerate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(response.status).toBe(500);
    expect(prismaMock.release.updateMany).toHaveBeenCalledWith({ where: { id: 'rel-1', status: 'PROCESSING', error: expect.stringContaining(':generation:PUBLISHED:') }, data: { status: 'PUBLISHED', error: 'Failed to generate notes. Please try again.' } });
    expect(prismaMock.generatedNotes.upsert).not.toHaveBeenCalled();
  });

  it('rejects unsupported generic webhook delivery with a clear error', async () => {
    prismaMock.release.findFirst.mockResolvedValue({
      id: 'rel-1', status: 'READY', publishedAt: new Date(), notes: {},
      repo: { config: { channels: [{ id: 'generic', type: 'WEBHOOK', enabled: true }] } },
    } as any);
    const response = await releases.request('/rel-1/publish', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channels: ['generic'] }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'Generic webhooks are not supported. Choose Slack or Discord.' });
    expect(publisherService.publishReleaseNotes).not.toHaveBeenCalled();
  });


  it('blocks silent retries when successful delivery could not be recorded', async () => {
    const reviewError = 'Delivery outcome needs review. Contact support before retrying.';
    prismaMock.release.findFirst.mockResolvedValue({
      id: 'rel-1', status: 'READY', publishedAt: new Date(), notes: {}, repo: { config: null },
    } as any);
    prismaMock.release.updateMany.mockResolvedValue({ count: 1 });
    publisherService.publishReleaseNotes.mockRejectedValue(Object.assign(new Error(reviewError), { name: 'PublicationOutcomeUnknown' }));
    const request = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' };
    const response = await releases.request('/rel-1/publish', request);
    expect(response.status).toBe(500);
    expect(prismaMock.release.updateMany).toHaveBeenCalledWith({ where: { id: 'rel-1', status: 'PROCESSING', error: expect.stringContaining(':publication:READY:') }, data: { status: 'FAILED', error: reviewError } });
    prismaMock.release.findFirst.mockResolvedValue({ id: 'rel-1', status: 'FAILED', error: reviewError, notes: {} } as any);
    publisherService.publishReleaseNotes.mockClear();
    expect((await releases.request('/rel-1/publish', request)).status).toBe(409);
    expect((await releases.request('/rel-1/regenerate', request)).status).toBe(409);
    expect(publisherService.publishReleaseNotes).not.toHaveBeenCalled();
  });

  it('restricts a Free default publication to the hosted changelog', async () => {
    prismaMock.release.findFirst.mockResolvedValue({
      id: 'rel-1', status: 'READY', publishedAt: new Date(), notes: {},
      repo: { id: 'repo-1', user: { subscriptionTier: 'FREE' }, config: { channels: [{ id: 'slack', type: 'SLACK', enabled: true }] } },
    } as any);
    prismaMock.release.updateMany.mockResolvedValue({ count: 1 });
    publisherService.publishReleaseNotes.mockResolvedValue({ status: 'PUBLISHED', failedCount: 0, distributedTo: 3 });
    expect((await releases.request('/rel-1/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(200);
    expect(publisherService.publishReleaseNotes).toHaveBeenCalledWith(expect.anything(), [], expect.any(String));
  });

  it('rejects explicit external delivery on Free before claiming or sending', async () => {
    prismaMock.release.findFirst.mockResolvedValue({
      id: 'rel-1', status: 'READY', publishedAt: new Date(), notes: {},
      repo: { id: 'repo-1', user: { subscriptionTier: 'FREE' }, config: { channels: [{ id: 'slack', type: 'SLACK', enabled: true }] } },
    } as any);
    const response = await releases.request('/rel-1/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channels: ['slack'] }) });
    expect(response.status).toBe(403);
    expect(prismaMock.release.updateMany).not.toHaveBeenCalled();
    expect(publisherService.publishReleaseNotes).not.toHaveBeenCalled();
  });

  it.each(['PRO', 'TEAM', 'grandfathered'])('allows entitled external delivery for %s', async tier => {
    if (tier === 'grandfathered') process.env.GRANDFATHERED_REPO_IDS = 'repo-1';
    try {
      prismaMock.release.findFirst.mockResolvedValue({
        id: 'rel-1', status: 'READY', publishedAt: new Date(), notes: {},
        repo: { id: 'repo-1', user: { subscriptionTier: tier === 'grandfathered' ? 'FREE' : tier }, config: { channels: [{ id: 'slack', type: 'SLACK', enabled: true }] } },
      } as any);
      prismaMock.release.updateMany.mockResolvedValue({ count: 1 });
      publisherService.publishReleaseNotes.mockResolvedValue({ status: 'PUBLISHED', failedCount: 0, distributedTo: 4 });
      expect((await releases.request('/rel-1/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channels: ['slack'] }) })).status).toBe(200);
      expect(publisherService.publishReleaseNotes).toHaveBeenCalledWith(expect.anything(), ['slack'], expect.any(String));
    } finally { delete process.env.GRANDFATHERED_REPO_IDS; }
  });

  it('exposes a stale generation as retryable while keeping internal claim tokens private', async () => {
    prismaMock.release.findFirst.mockResolvedValue({
      id: 'rel-1', status: 'PROCESSING', updatedAt: new Date(0), error: 'shiplog-processing:v1:generation:PENDING:secret-token', repo: { id: 'repo-1' },
    } as any);
    prismaMock.release.updateMany.mockResolvedValue({ count: 1 });
    const response = await releases.request('/rel-1');
    expect(await response.json()).toMatchObject({ status: 'FAILED', error: null });
  });

  it.each([
    { status: 'PROCESSING', error: null },
    { status: 'PUBLISHED', error: 'Delivery outcome needs review. Contact support.' },
  ])('rejects edits while processing or awaiting delivery review (%s)', async state => {
    prismaMock.release.findFirst.mockResolvedValue({ id: 'rel-1', ...state, notes: {}, updatedAt: new Date() } as any);
    const response = await releases.request('/rel-1/notes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer: 'Edited notes' }) });
    expect(response.status).toBe(409);
    expect(prismaMock.generatedNotes.update).not.toHaveBeenCalled();
  });

  it('rejects an edit when generation claimed the observed release first', async () => {
    prismaMock.release.findFirst.mockResolvedValue({ id: 'rel-1', status: 'READY', error: null, notes: {}, updatedAt: new Date() } as any);
    prismaMock.release.updateMany.mockResolvedValue({ count: 0 });
    const response = await releases.request('/rel-1/notes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer: 'Edited notes' }) });
    expect(response.status).toBe(409);
    expect(prismaMock.generatedNotes.update).not.toHaveBeenCalled();
  });

  it('a successful edit prevents a stale publication from sending the previous notes', async () => {
    const observed = {
      id: 'rel-1', status: 'READY', error: null, updatedAt: new Date(), publishedAt: new Date(), notes: { customer: 'Old notes' },
      repo: { id: 'repo-1', user: { subscriptionTier: 'FREE' }, config: null },
    };
    let state = { ...observed };
    prismaMock.release.findFirst.mockResolvedValue(observed as any);
    prismaMock.release.updateMany.mockImplementation(async ({ where, data }: any) => {
      if (where.updatedAt.getTime() !== state.updatedAt.getTime() || where.status !== state.status || where.error !== state.error) return { count: 0 };
      state = { ...state, ...data };
      return { count: 1 };
    });
    const edit = await releases.request('/rel-1/notes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer: 'Edited notes' }) });
    expect(edit.status).toBe(200);
    expect(state.updatedAt.getTime()).toBeGreaterThan(observed.updatedAt.getTime());
    expect(prismaMock.generatedNotes.update).toHaveBeenCalled();
    const publish = await releases.request('/rel-1/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(publish.status).toBe(409);
    expect(publisherService.publishReleaseNotes).not.toHaveBeenCalled();
  });

});

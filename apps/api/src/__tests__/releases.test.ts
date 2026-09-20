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
  });

  describe('GET /:id', () => {
    it('returns release detail', async () => {
      prismaMock.release.findFirst.mockResolvedValue({
        id: 'rel-1',
        repo: { userId: 'test-user-id' },
        notes: { customer: 'notes' },
      } as any);

      const res = await releases.request('/rel-1');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe('rel-1');
      expect(data.notes.customer).toBe('notes');
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
        tagName: 'v1.0.0',
        repo: {
          userId: 'test-user-id',
          owner: 'owner',
          name: 'repo',
          user: { accessToken: 'enc-token' }
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
      expect(publisherService.publishReleaseNotes).toHaveBeenCalledWith(expect.objectContaining({ id: 'rel-1' }), []);
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
        status: 'READY', publishedAt: new Date(), isDraft: false,
        notes: { id: 'notes-1' },
      } as any);

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
    expect(prismaMock.release.update).toHaveBeenCalledWith({ where: { id: 'rel-1' }, data: { status: 'PUBLISHED', error: 'GitHub temporarily unavailable' } });
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
    expect(prismaMock.release.update).toHaveBeenCalledWith({ where: { id: 'rel-1' }, data: { status: 'FAILED', error: reviewError } });
    prismaMock.release.findFirst.mockResolvedValue({ id: 'rel-1', status: 'FAILED', error: reviewError, notes: {} } as any);
    publisherService.publishReleaseNotes.mockClear();
    expect((await releases.request('/rel-1/publish', request)).status).toBe(409);
    expect((await releases.request('/rel-1/regenerate', request)).status).toBe(409);
    expect(publisherService.publishReleaseNotes).not.toHaveBeenCalled();
  });

});

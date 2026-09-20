import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createHmac } from 'node:crypto';

const prisma = {
  repo: { findFirst: jest.fn<any>() },
  release: { upsert: jest.fn<any>(), updateMany: jest.fn<any>(), update: jest.fn<any>() },
};
const fetchReleaseData = jest.fn<any>();
const generateReleaseNotes = jest.fn<any>();
const publishReleaseNotes = jest.fn<any>();
const decrypt = jest.fn<any>();
jest.unstable_mockModule('../lib/db.js', () => ({ prisma }));
jest.unstable_mockModule('../services/github.js', () => ({ fetchReleaseData }));
jest.unstable_mockModule('../services/generator.js', () => ({ generateReleaseNotes }));
jest.unstable_mockModule('../services/publisher.js', () => ({ publishReleaseNotes }));
jest.unstable_mockModule('../lib/auth.js', () => ({ decrypt }));
const { webhooks } = await import('./webhooks.js');

const notes = { customer: 'C', developer: 'D', stakeholder: 'S', tokensUsed: 10, model: 'test' };
const payload = {
  action: 'published',
  release: { id: 12345, tag_name: 'v1.0', name: 'Release', body: 'Notes', html_url: 'https://github.com/owner/repo/releases/v1.0', draft: false, published_at: '2026-09-01T00:00:00Z' },
  repository: { full_name: 'owner/repo' },
};
const secret = 'test-secret';
const request = (body: unknown = payload, signature?: string, event = 'release') => {
  const text = JSON.stringify(body);
  return webhooks.request('/github', {
    method: 'POST', body: text,
    headers: { 'x-github-event': event, 'x-hub-signature-256': signature ?? `sha256=${createHmac('sha256', secret).update(text).digest('hex')}` },
  });
};
const flushBackground = () => new Promise<void>(resolve => setImmediate(resolve));
let stored: any;
let repo: any;
const matches = (where: any) => stored && Object.entries(where).every(([key, value]) =>
  value instanceof Date ? stored[key]?.getTime() === value.getTime() : stored[key] === value
);

describe('durable webhook receipt and processing', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.GRANDFATHERED_REPO_IDS;
    stored = undefined;
    repo = {
      id: 'repo-1', fullName: 'owner/repo', owner: 'owner', name: 'repo', webhookSecret: secret,
      user: { subscriptionTier: 'PRO', accessToken: 'encrypted' },
      config: { autoGenerate: true, autoPublish: false, channels: [], emailRecipients: [] },
    };
    prisma.repo.findFirst.mockImplementation(async () => repo);
    prisma.release.upsert.mockImplementation(async ({ create }: any) => {
      stored ??= { id: 'release-1', error: null, updatedAt: new Date(), notes: null, ...create };
      return { ...stored };
    });
    prisma.release.updateMany.mockImplementation(async ({ where, data }: any) => {
      if (!matches(where)) return { count: 0 };
      stored = { ...stored, ...data, updatedAt: data.updatedAt ?? new Date() };
      return { count: 1 };
    });
    prisma.release.update.mockImplementation(async ({ where, data }: any) => {
      if (!matches(where)) throw new Error('Claim no longer owned');
      stored = { ...stored, ...data, notes: data.notes?.upsert?.create ?? stored.notes, updatedAt: new Date() };
      return { ...stored };
    });
    decrypt.mockResolvedValue('token');
    fetchReleaseData.mockResolvedValue({
      release: { id: 12345, tagName: 'v1.0', body: 'Notes', isDraft: false, publishedAt: new Date() },
      commits: [], pullRequests: [],
    });
    generateReleaseNotes.mockResolvedValue(notes);
    publishReleaseNotes.mockResolvedValue({ status: 'PUBLISHED', distributedTo: 3, failedCount: 0 });
  });
  afterEach(async () => { await flushBackground(); delete process.env.GRANDFATHERED_REPO_IDS; });

  test('acknowledges a persisted release before a slow AI call finishes', async () => {
    let finish!: (value: typeof notes) => void;
    generateReleaseNotes.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const response = await request();
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: 'queued', releaseId: 'release-1' });
    expect(stored.status).toBe('PENDING');
    expect(fetchReleaseData).not.toHaveBeenCalled();
    await flushBackground();
    expect(stored.status).toBe('PROCESSING');
    expect(stored.error).toContain(':generation:PENDING:');
    finish(notes);
    await flushBackground();
    expect(stored).toMatchObject({ status: 'READY', error: null, notes });
    expect(publishReleaseNotes).not.toHaveBeenCalled();
  });

  test('does not acknowledge when receipt cannot be persisted', async () => {
    prisma.release.upsert.mockRejectedValue(new Error('Database unavailable'));
    expect((await request()).status).toBe(500);
    await flushBackground();
    expect(generateReleaseNotes).not.toHaveBeenCalled();
  });

  test('concurrent redeliveries generate only once', async () => {
    const responses = await Promise.all([request(), request()]);
    expect(responses.every(response => response.status === 202)).toBe(true);
    await flushBackground();
    expect(generateReleaseNotes).toHaveBeenCalledTimes(1);
    expect(stored.status).toBe('READY');
  });

  test.each([false, undefined])('requires explicit autoGenerate opt-in (%s)', async autoGenerate => {
    repo.config.autoGenerate = autoGenerate;
    repo.config.autoPublish = true;
    expect(await (await request()).json()).toMatchObject({ status: 'skipped' });
    await flushBackground();
    expect(stored.status).toBe('SKIPPED');
    expect(fetchReleaseData).not.toHaveBeenCalled();
    expect(generateReleaseNotes).not.toHaveBeenCalled();
    expect(publishReleaseNotes).not.toHaveBeenCalled();
  });

  test('free accounts do not automatically generate even with a saved enabled setting', async () => {
    repo.user.subscriptionTier = 'FREE';
    expect(await (await request()).json()).toMatchObject({ status: 'skipped' });
    await flushBackground();
    expect(generateReleaseNotes).not.toHaveBeenCalled();
  });

  test('explicitly grandfathered repositories retain opted-in automation', async () => {
    repo.user.subscriptionTier = 'FREE';
    process.env.GRANDFATHERED_REPO_IDS = 'repo-1';
    expect((await request()).status).toBe(202);
    await flushBackground();
    expect(generateReleaseNotes).toHaveBeenCalledTimes(1);
  });

  test('automatically publishes only after notes are saved and separately claimed', async () => {
    repo.config.autoPublish = true;
    expect((await request()).status).toBe(202);
    await flushBackground();
    expect(publishReleaseNotes).toHaveBeenCalledWith(expect.objectContaining({ notes }), undefined, expect.stringContaining(':publication:READY:'));
    expect(stored.error).toContain(':publication:READY:');
  });

  test('a generation failure is persisted for manual or webhook retry', async () => {
    generateReleaseNotes.mockRejectedValue(new Error('Provider unavailable'));
    expect((await request()).status).toBe(202);
    await flushBackground();
    expect(stored).toMatchObject({ status: 'FAILED', error: 'Failed to generate notes. Please try again.' });
    generateReleaseNotes.mockResolvedValue(notes);
    expect((await request()).status).toBe(202);
    await flushBackground();
    expect(stored.status).toBe('READY');
  });

  test.each(['PENDING', 'PROCESSING'])('recovers a %s generation after restart', async status => {
    stored = { id: 'release-1', repoId: 'repo-1', tagName: 'v1.0', status, notes: null,
      error: status === 'PROCESSING' ? 'shiplog-processing:v1:generation:PENDING:old-claim' : null,
      updatedAt: new Date(Date.now() - 11 * 60 * 1000) };
    expect((await request()).status).toBe(202);
    await flushBackground();
    expect(stored.status).toBe('READY');
    expect(generateReleaseNotes).toHaveBeenCalledTimes(1);
  });

  test.each([null, 'shiplog-processing:v1:publication:READY:old-claim'])('holds interrupted/legacy publication for review (%s)', async error => {
    stored = { id: 'release-1', repoId: 'repo-1', status: 'PROCESSING', notes, error,
      isDraft: false, publishedAt: new Date(), updatedAt: new Date(Date.now() - 11 * 60 * 1000) };
    repo.config.autoPublish = true;
    expect(await (await request()).json()).toMatchObject({ status: 'ignored' });
    await flushBackground();
    expect(stored.status).toBe('FAILED');
    expect(stored.error).toContain('Delivery outcome needs review.');
    expect(generateReleaseNotes).not.toHaveBeenCalled();
    expect(publishReleaseNotes).not.toHaveBeenCalled();
  });

  test('resumes ordinary partial publication without regenerating notes', async () => {
    stored = { id: 'release-1', repoId: 'repo-1', status: 'PARTIAL_SUCCESS', notes, error: null,
      isDraft: false, publishedAt: new Date(), updatedAt: new Date() };
    repo.config.autoPublish = true;
    expect((await request()).status).toBe(202);
    await flushBackground();
    expect(publishReleaseNotes).toHaveBeenCalledTimes(1);
    expect(generateReleaseNotes).not.toHaveBeenCalled();
  });

  test('does not resume publication after paid entitlement is removed', async () => {
    stored = { id: 'release-1', repoId: 'repo-1', status: 'READY', notes, error: null,
      isDraft: false, publishedAt: new Date(), updatedAt: new Date() };
    repo.config.autoPublish = true;
    repo.user.subscriptionTier = 'FREE';
    expect(await (await request()).json()).toMatchObject({ status: 'ignored' });
    await flushBackground();
    expect(publishReleaseNotes).not.toHaveBeenCalled();
  });

  test('ignores a fresh claim and never resumes completed publication', async () => {
    for (const status of ['PROCESSING', 'PUBLISHED']) {
      stored = { id: 'release-1', repoId: 'repo-1', status, notes, error: null, updatedAt: new Date() };
      expect(await (await request()).json()).toMatchObject({ status: 'ignored' });
    }
    await flushBackground();
    expect(generateReleaseNotes).not.toHaveBeenCalled();
    expect(publishReleaseNotes).not.toHaveBeenCalled();
  });

  test('does not process paused repositories', async () => {
    repo.status = 'PAUSED';
    expect(await (await request()).json()).toEqual({ status: 'ignored', reason: 'repository_paused' });
    expect(prisma.release.upsert).not.toHaveBeenCalled();
  });

  test('authenticates before persisting or scheduling work', async () => {
    expect((await request(payload, 'sha256=invalid')).status).toBe(401);
    expect((await request(payload, '')).status).toBe(401);
    repo.webhookSecret = null;
    expect((await request()).status).toBe(401);
    repo = null;
    expect((await request()).status).toBe(401);
    expect(prisma.release.upsert).not.toHaveBeenCalled();
  });

  test('rejects malformed published events', async () => {
    expect((await request({ action: 'published' })).status).toBe(400);
    expect((await request({ ...payload, release: { ...payload.release, published_at: 'not a date' } })).status).toBe(400);
    expect(prisma.release.upsert).not.toHaveBeenCalled();
  });
});

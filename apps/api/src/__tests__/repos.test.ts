import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';

// Mock dependencies using unstable_mockModule for ESM support
jest.unstable_mockModule('../lib/db.js', () => ({
  __esModule: true,
  prisma: mockDeep<PrismaClient>(),
}));

jest.unstable_mockModule('../lib/auth.js', () => ({
  requireAuth: async (c: any, next: any) => {
    c.set('user', { id: 'test-user-id', subscriptionTier: 'FREE' });
    await next();
  },
  decrypt: jest.fn().mockResolvedValue('decrypted-access-token'),
}));

jest.unstable_mockModule('../services/github.js', () => ({
  listUserRepos: jest.fn(),
  getRepository: jest.fn(),
  createWebhook: jest.fn(),
  deleteWebhook: jest.fn(),
}));

jest.unstable_mockModule('../services/importer.js', () => ({
  importRepoHistory: jest.fn().mockResolvedValue(undefined),
}));

describe('Repos Routes', () => {
  let repos: any;
  let prismaMock: DeepMockProxy<PrismaClient>;
  let githubService: any;
  let importerService: any;

  beforeEach(async () => {
    jest.resetModules();

    // Re-import mocks
    const db = await import('../lib/db.js');
    prismaMock = db.prisma as unknown as DeepMockProxy<PrismaClient>;

    githubService = await import('../services/github.js');
    importerService = await import('../services/importer.js');

    const module = await import('../routes/repos.js');
    repos = module.repos;

    jest.clearAllMocks();
  });

  describe('GET /', () => {
    it('lists connected repos', async () => {
      prismaMock.repo.findMany.mockResolvedValue([
        {
          id: 'repo-1',
          githubId: 101,
          name: 'repo-1',
          fullName: 'owner/repo-1',
          description: 'desc',
          status: 'ACTIVE',
          releases: [],
        } as any
      ]);

      const res = await repos.request('/');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.repos).toHaveLength(1);
      expect(data.repos[0].fullName).toBe('owner/repo-1');
    });
  });

  describe('GET /:id', () => {
    it('returns repo details if found', async () => {
      prismaMock.repo.findFirst.mockResolvedValue({
        id: 'repo-1',
        fullName: 'owner/repo-1',
        releases: [],
        config: {},
      } as any);

      const res = await repos.request('/repo-1');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe('repo-1');
    });

    it('returns 404 if repo not found', async () => {
      prismaMock.repo.findFirst.mockResolvedValue(null);
      const res = await repos.request('/non-existent');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /github/available', () => {
    it('lists available GitHub repos excluding connected ones', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        accessToken: 'enc-token',
      } as any);

      githubService.listUserRepos.mockResolvedValue([
        { id: 101, name: 'repo-1', full_name: 'owner/repo-1', owner: 'owner', description: 'desc' },
        { id: 102, name: 'repo-2', full_name: 'owner/repo-2', owner: 'owner', description: 'desc' },
      ]);

      prismaMock.repo.findMany.mockResolvedValue([
        { githubId: 101 } as any
      ]);

      const res = await repos.request('/github/available');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.repos).toHaveLength(1);
      expect(data.repos[0].githubId).toBe(102);
    });
  });

  describe('POST /connect', () => {
    it('connects a new repo', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        accessToken: 'enc-token',
        subscriptionTier: 'PRO',
      } as any);

      prismaMock.repo.findFirst.mockResolvedValue(null); // Not existing
      prismaMock.repo.count.mockResolvedValue(0); // Limit not reached

      githubService.createWebhook.mockResolvedValue({ id: 999 });
      githubService.getRepository.mockResolvedValue({
        id: 103, name: 'new-repo', full_name: 'owner/new-repo', owner: { login: 'owner' }, description: null,
      });

      prismaMock.repo.create.mockResolvedValue({
        id: 'new-repo-id',
        fullName: 'owner/new-repo',
        webhookActive: true,
      } as any);

      prismaMock.repoConfig.create.mockResolvedValue({} as any);

      const res = await repos.request('/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          githubId: 103,
          owner: 'owner',
          repo: 'new-repo',
          fullName: 'owner/new-repo',
        }),
      });

      expect(res.status).toBe(200);
      expect(githubService.createWebhook).toHaveBeenCalled();
      expect(prismaMock.repo.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isPublic: false, config: { create: {} } }) }));
      expect(importerService.importRepoHistory).toHaveBeenCalled();
    });

    it('enforces limits', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        accessToken: 'enc-token',
        subscriptionTier: 'FREE',
      } as any);

      prismaMock.repo.findFirst.mockResolvedValue(null);
      prismaMock.repo.count.mockResolvedValue(1); // Limit reached for FREE

      const res = await repos.request('/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          githubId: 103,
          owner: 'owner',
          repo: 'new-repo',
          fullName: 'owner/new-repo',
        }),
      });

      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ upgradeRequired: true });
    });
  });

  describe('PATCH /:id/config', () => {
    it('updates repo config', async () => {
      prismaMock.repo.findFirst.mockResolvedValue({ id: 'repo-1' } as any);
      prismaMock.repoConfig.upsert.mockResolvedValue({
        repoId: 'repo-1',
        autoGenerate: true,
      } as any);

      const res = await repos.request('/repo-1/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoGenerate: true }),
      });

      expect(res.status).toBe(200);
      expect(prismaMock.repoConfig.upsert).toHaveBeenCalled();
    });
  });

  describe('PATCH /:id/settings', () => {
    it('updates repo settings', async () => {
      prismaMock.repo.findFirst.mockResolvedValue({ id: 'repo-1' } as any);
      prismaMock.repo.update.mockResolvedValue({
        id: 'repo-1',
        isPublic: true,
      } as any);

      const res = await repos.request('/repo-1/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: true }),
      });

      expect(res.status).toBe(200);
      expect(prismaMock.repo.update).toHaveBeenCalled();
    });
  });

  describe('DELETE /:id', () => {
    it('disconnects repo and deletes webhook', async () => {
      // checkRepoAdmin uses prisma.repo.findUnique (not findFirst)
      prismaMock.repo.findUnique.mockResolvedValue({
        id: 'repo-1',
        userId: 'test-user-id',
        organizationId: null,
        webhookId: 999,
        owner: 'owner',
        name: 'repo',
        fullName: 'owner/repo',
      } as any);

      prismaMock.user.findUnique.mockResolvedValue({
        accessToken: 'enc-token',
      } as any);

      const res = await repos.request('/repo-1', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      expect(githubService.deleteWebhook).toHaveBeenCalled();
      expect(prismaMock.repo.delete).toHaveBeenCalled();
    });
  });

  it('does not create a broken repository when GitHub denies webhook creation', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ accessToken: 'enc-token', subscriptionTier: 'PRO' } as any);
    prismaMock.repo.findFirst.mockResolvedValue(null);
    prismaMock.repo.count.mockResolvedValue(0);
    githubService.getRepository.mockResolvedValue({ id: 103, name: 'repo', full_name: 'owner/repo', owner: { login: 'owner' } });
    githubService.createWebhook.mockRejectedValue(new Error('403'));
    const response = await repos.request('/connect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ githubId: 103, owner: 'owner', repo: 'repo', fullName: 'owner/repo' }),
    });
    expect(response.status).toBe(502);
    expect(prismaMock.repo.create).not.toHaveBeenCalled();
    expect(importerService.importRepoHistory).not.toHaveBeenCalled();
  });

  it('rejects fabricated repository IDs before creating a webhook', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ accessToken: 'enc-token', subscriptionTier: 'PRO' } as any);
    prismaMock.repo.findFirst.mockResolvedValue(null);
    prismaMock.repo.count.mockResolvedValue(0);
    githubService.getRepository.mockResolvedValue({ id: 999, name: 'repo', full_name: 'owner/repo', owner: { login: 'owner' } });
    const response = await repos.request('/connect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ githubId: 103, owner: 'owner', repo: 'repo', fullName: 'owner/repo' }),
    });
    expect(response.status).toBe(400);
    expect(githubService.createWebhook).not.toHaveBeenCalled();
    expect(prismaMock.repo.create).not.toHaveBeenCalled();
  });

  it('cleans up the GitHub webhook when saving the repository fails', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ accessToken: 'enc-token', subscriptionTier: 'PRO' } as any);
    prismaMock.repo.findFirst.mockResolvedValue(null);
    prismaMock.repo.count.mockResolvedValue(0);
    githubService.getRepository.mockResolvedValue({ id: 103, name: 'repo', full_name: 'owner/repo', owner: { login: 'owner' } });
    githubService.createWebhook.mockResolvedValue({ id: 99 });
    prismaMock.repo.create.mockRejectedValue(new Error('Database unavailable'));
    const response = await repos.request('/connect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ githubId: 103, owner: 'owner', repo: 'repo', fullName: 'owner/repo' }),
    });
    expect(response.status).toBe(502);
    expect(prismaMock.repo.create).toHaveBeenCalledTimes(1);
    expect(githubService.deleteWebhook).toHaveBeenCalledWith('owner', 'repo', 99, 'decrypted-access-token');
  });


  it('preserves repository and webhook secret when GitHub deletion fails', async () => {
    prismaMock.repo.findUnique.mockResolvedValue({ id: 'repo-1', userId: 'test-user-id', webhookId: 99, owner: 'owner', name: 'repo' } as any);
    prismaMock.user.findUnique.mockResolvedValue({ accessToken: 'enc-token' } as any);
    githubService.deleteWebhook.mockRejectedValue(new Error('403'));
    const response = await repos.request('/repo-1', { method: 'DELETE' });
    expect(response.status).toBe(502);
    expect(prismaMock.repo.delete).not.toHaveBeenCalled();
  });

  it('rejects unsupported generic webhook channel creation', async () => {
    const response = await repos.request('/repo-1/channels', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'WEBHOOK', name: 'Generic', audience: 'CUSTOMER', webhookUrl: 'https://example.com/hook' }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'Generic webhooks are not supported. Choose Slack or Discord.' });
    expect(prismaMock.channel.create).not.toHaveBeenCalled();
  });

});

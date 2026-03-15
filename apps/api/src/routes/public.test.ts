import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockDeep } from 'jest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';

const prismaMock = mockDeep<PrismaClient>();

jest.unstable_mockModule('../lib/db.js', () => ({
  prisma: prismaMock,
}));

jest.unstable_mockModule('../middleware/rate-limit.js', () => ({
  rateLimit: jest.fn<any>(() => async (_c: any, next: any) => {
    await next();
  }),
}));

jest.unstable_mockModule('../lib/sanitize.js', () => ({
  sanitizeHtml: jest.fn<any>((html: string) => html),
}));

jest.unstable_mockModule('../lib/logger.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockFetch = jest.fn<any>();
global.fetch = mockFetch as any;

const { publicChangelog } = await import('./public.js');

describe('Public Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/', publicChangelog);
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('POST /feedback', () => {
    it('should submit feedback successfully', async () => {
      process.env.DISCORD_FEEDBACK_WEBHOOK_URL = 'https://discord.com/api/webhooks/test';
      mockFetch.mockResolvedValue({ ok: true });

      const payload = {
        repoId: 'repo-1',
        feedback: 'Great changelog!',
        email: 'user@example.com',
        source: 'widget',
      };

      const res = await app.request('/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://discord.com/api/webhooks/test',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Great changelog!'),
        })
      );

      delete process.env.DISCORD_FEEDBACK_WEBHOOK_URL;
    });

    it('should validate input - missing repoId', async () => {
      const payload = {
        feedback: 'Some feedback',
      };

      const res = await app.request('/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(400);
    });

    it('should validate input - empty feedback', async () => {
      const payload = {
        repoId: 'repo-1',
        feedback: '',
      };

      const res = await app.request('/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(400);
    });

    it('should validate input - invalid email', async () => {
      const payload = {
        repoId: 'repo-1',
        feedback: 'Some feedback',
        email: 'not-an-email',
      };

      const res = await app.request('/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(400);
    });

    it('should succeed without discord webhook configured', async () => {
      delete process.env.DISCORD_FEEDBACK_WEBHOOK_URL;

      const payload = {
        repoId: 'repo-1',
        feedback: 'Great changelog!',
      };

      const res = await app.request('/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('GET /:slug', () => {
    it('should return public repo data', async () => {
      const mockRepo = {
        id: 'repo-1',
        name: 'my-repo',
        fullName: 'my-org/my-repo',
        description: 'A test repo',
        slug: 'my-repo',
        publicTitle: 'My Awesome Product',
        publicDescription: 'Public description',
        publicLogoUrl: 'https://example.com/logo.png',
        publicAccentColor: '#FF0000',
        hidePoweredBy: false,
        user: {
          subscriptionTier: 'FREE',
        },
        releases: [
          {
            id: 'rel-1',
            tagName: 'v1.0.0',
            name: 'Release 1.0.0',
            publishedAt: new Date('2025-01-15'),
            notes: {
              id: 'note-1',
              customer: 'Customer notes',
              developer: 'Developer notes',
              stakeholder: 'Stakeholder notes',
            },
          },
        ],
      };

      prismaMock.repo.findFirst.mockResolvedValue(mockRepo as any);

      const res = await app.request('/my-repo');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe('repo-1');
      expect(data.name).toBe('My Awesome Product');
      expect(data.description).toBe('Public description');
      expect(data.logoUrl).toBe('https://example.com/logo.png');
      expect(data.accentColor).toBe('#FF0000');
      expect(data.showPoweredBy).toBe(true);
      expect(data.releases).toHaveLength(1);
      expect(data.releases[0].version).toBe('v1.0.0');
      expect(data.releases[0].notes.customer).toBe('Customer notes');
    });

    it('should return 404 for missing slug', async () => {
      prismaMock.repo.findFirst.mockResolvedValue(null);

      const res = await app.request('/nonexistent');

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Changelog not found');
    });

    it('should hide branding for TEAM users with hidePoweredBy', async () => {
      prismaMock.repo.findFirst.mockResolvedValue({
        id: 'repo-1',
        name: 'my-repo',
        fullName: 'my-org/my-repo',
        description: null,
        slug: 'my-repo',
        publicTitle: null,
        publicDescription: null,
        publicLogoUrl: null,
        publicAccentColor: null,
        hidePoweredBy: true,
        user: { subscriptionTier: 'TEAM' },
        releases: [],
      } as any);

      const res = await app.request('/my-repo');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.showPoweredBy).toBe(false);
    });

    it('should still show branding for non-TEAM users even with hidePoweredBy', async () => {
      prismaMock.repo.findFirst.mockResolvedValue({
        id: 'repo-1',
        name: 'my-repo',
        fullName: 'my-org/my-repo',
        description: null,
        slug: 'my-repo',
        publicTitle: null,
        publicDescription: null,
        publicLogoUrl: null,
        publicAccentColor: null,
        hidePoweredBy: true,
        user: { subscriptionTier: 'PRO' },
        releases: [],
      } as any);

      const res = await app.request('/my-repo');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.showPoweredBy).toBe(true);
    });
  });

  describe('GET /:slug/releases', () => {
    it('should return paginated releases', async () => {
      prismaMock.repo.findFirst.mockResolvedValue({ id: 'repo-1' } as any);

      const mockReleases = [
        { id: 'rel-1', tagName: 'v2.0.0', name: 'Release 2', publishedAt: new Date('2025-02-01') },
        { id: 'rel-2', tagName: 'v1.0.0', name: 'Release 1', publishedAt: new Date('2025-01-01') },
      ];

      prismaMock.release.findMany.mockResolvedValue(mockReleases as any);
      prismaMock.release.count.mockResolvedValue(2);

      const res = await app.request('/my-repo/releases');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.releases).toHaveLength(2);
      expect(data.releases[0].version).toBe('v2.0.0');
      expect(data.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        pages: 1,
      });
    });

    it('should return 404 for missing repo', async () => {
      prismaMock.repo.findFirst.mockResolvedValue(null);

      const res = await app.request('/nonexistent/releases');

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Changelog not found');
    });

    it('should respect page and limit query params', async () => {
      prismaMock.repo.findFirst.mockResolvedValue({ id: 'repo-1' } as any);
      prismaMock.release.findMany.mockResolvedValue([]);
      prismaMock.release.count.mockResolvedValue(50);

      const res = await app.request('/my-repo/releases?page=2&limit=10');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.pagination.page).toBe(2);
      expect(data.pagination.limit).toBe(10);
      expect(data.pagination.pages).toBe(5);

      expect(prismaMock.release.findMany).toHaveBeenCalledWith(expect.objectContaining({
        skip: 10,
        take: 10,
      }));
    });
  });

  describe('GET /:slug/releases/:version', () => {
    it('should return a specific release', async () => {
      prismaMock.repo.findFirst.mockResolvedValue({
        id: 'repo-1',
        name: 'my-repo',
        publicTitle: 'My Product',
      } as any);

      const mockRelease = {
        id: 'rel-1',
        tagName: 'v1.0.0',
        name: 'Release 1.0.0',
        body: 'Release body content',
        publishedAt: new Date('2025-01-15'),
        notes: {
          id: 'note-1',
          customer: 'Customer notes',
          developer: 'Developer notes',
          stakeholder: 'Stakeholder notes',
        },
      };

      prismaMock.release.findFirst.mockResolvedValue(mockRelease as any);

      const res = await app.request('/my-repo/releases/v1.0.0');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.repoName).toBe('My Product');
      expect(data.version).toBe('v1.0.0');
      expect(data.name).toBe('Release 1.0.0');
      expect(data.body).toBe('Release body content');
      expect(data.notes.customer).toBe('Customer notes');
    });

    it('should return 404 when repo not found', async () => {
      prismaMock.repo.findFirst.mockResolvedValue(null);

      const res = await app.request('/nonexistent/releases/v1.0.0');

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Changelog not found');
    });

    it('should return 404 when release not found', async () => {
      prismaMock.repo.findFirst.mockResolvedValue({
        id: 'repo-1',
        name: 'my-repo',
        publicTitle: null,
      } as any);

      prismaMock.release.findFirst.mockResolvedValue(null);

      const res = await app.request('/my-repo/releases/v9.9.9');

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Release not found');
    });
  });
});

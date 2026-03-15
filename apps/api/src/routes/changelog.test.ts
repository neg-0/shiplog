import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockDeep } from 'jest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';

const prismaMock = mockDeep<PrismaClient>();

jest.unstable_mockModule('../lib/db.js', () => ({
  prisma: prismaMock,
}));

const { changelog } = await import('./changelog.js');

describe('Changelog Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/', changelog);
    jest.clearAllMocks();
  });

  describe('GET /:org/:repo', () => {
    it('should return changelog for a public repo', async () => {
      const mockRepo = {
        id: 'repo-1',
        name: 'my-repo',
        fullName: 'my-org/my-repo',
        owner: 'my-org',
        description: 'A test repo',
        config: {
          productName: 'My Product',
          companyName: 'My Company',
        },
      };

      const mockReleases = [
        {
          id: 'rel-1',
          tagName: 'v1.0.0',
          name: 'Release 1.0.0',
          publishedAt: new Date('2025-01-15'),
          htmlUrl: 'https://github.com/my-org/my-repo/releases/v1.0.0',
          notes: {
            customer: 'Customer notes',
            developer: 'Developer notes',
            stakeholder: 'Stakeholder notes',
          },
        },
      ];

      prismaMock.repo.findFirst.mockResolvedValue(mockRepo as any);
      prismaMock.release.findMany.mockResolvedValue(mockReleases as any);

      const res = await app.request('/my-org/my-repo');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.org).toBe('my-org');
      expect(data.repo).toBe('my-repo');
      expect(data.fullName).toBe('my-org/my-repo');
      expect(data.productName).toBe('My Product');
      expect(data.companyName).toBe('My Company');
      expect(data.releases).toHaveLength(1);
      expect(data.releases[0].version).toBe('v1.0.0');
      expect(data.releases[0].date).toBe('2025-01-15');
      expect(data.releases[0].notes.customer).toBe('Customer notes');

      expect(prismaMock.repo.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          fullName: 'my-org/my-repo',
          status: 'ACTIVE',
          isPublic: true,
        },
      }));
    });

    it('should return 404 for non-existent repo', async () => {
      prismaMock.repo.findFirst.mockResolvedValue(null);

      const res = await app.request('/no-org/no-repo');

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Changelog not found');
    });

    it('should respect the limit query param', async () => {
      prismaMock.repo.findFirst.mockResolvedValue({
        id: 'repo-1',
        name: 'my-repo',
        fullName: 'my-org/my-repo',
        owner: 'my-org',
        description: null,
        config: null,
      } as any);
      prismaMock.release.findMany.mockResolvedValue([]);

      const res = await app.request('/my-org/my-repo?limit=5');

      expect(res.status).toBe(200);
      expect(prismaMock.release.findMany).toHaveBeenCalledWith(expect.objectContaining({
        take: 5,
      }));
    });

    it('should cap limit at 50', async () => {
      prismaMock.repo.findFirst.mockResolvedValue({
        id: 'repo-1',
        name: 'my-repo',
        fullName: 'my-org/my-repo',
        owner: 'my-org',
        description: null,
        config: null,
      } as any);
      prismaMock.release.findMany.mockResolvedValue([]);

      const res = await app.request('/my-org/my-repo?limit=100');

      expect(res.status).toBe(200);
      expect(prismaMock.release.findMany).toHaveBeenCalledWith(expect.objectContaining({
        take: 50,
      }));
    });

    it('should fallback productName/companyName when config is null', async () => {
      prismaMock.repo.findFirst.mockResolvedValue({
        id: 'repo-1',
        name: 'my-repo',
        fullName: 'my-org/my-repo',
        owner: 'my-org',
        description: null,
        config: null,
      } as any);
      prismaMock.release.findMany.mockResolvedValue([]);

      const res = await app.request('/my-org/my-repo');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.productName).toBe('my-repo');
      expect(data.companyName).toBe('my-org');
    });
  });

  describe('GET /', () => {
    it('should list public changelogs', async () => {
      prismaMock.repo.findMany.mockResolvedValue([
        {
          fullName: 'org/repo-1',
          description: 'First repo',
          _count: { releases: 5 },
        },
        {
          fullName: 'org/repo-2',
          description: 'Second repo',
          _count: { releases: 3 },
        },
      ] as any);

      const res = await app.request('/');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.changelogs).toHaveLength(2);
      expect(data.changelogs[0].fullName).toBe('org/repo-1');
      expect(data.changelogs[0].releaseCount).toBe(5);
      expect(data.changelogs[0].url).toBe('/changelog/org/repo-1');
      expect(data.changelogs[1].fullName).toBe('org/repo-2');
    });

    it('should return empty list when no public changelogs exist', async () => {
      prismaMock.repo.findMany.mockResolvedValue([]);

      const res = await app.request('/');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.changelogs).toHaveLength(0);
    });
  });
});

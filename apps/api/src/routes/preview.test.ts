import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockDeep } from 'jest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';

const prismaMock = mockDeep<PrismaClient>();

jest.unstable_mockModule('../lib/db.js', () => ({
  prisma: prismaMock,
}));

const { preview } = await import('./preview.js');

describe('Preview Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/', preview);
    jest.clearAllMocks();
  });

  describe('GET /:slug', () => {
    it('should return preview data and increment view count', async () => {
      const mockChangelog = {
        id: 'cl-1',
        slug: 'abc123',
        repoOwner: 'my-org',
        repoName: 'my-repo',
        title: 'v1.0.0 Release Notes',
        body: JSON.stringify({
          customer: 'Customer-facing notes',
          developer: 'Developer notes',
          stakeholder: 'Stakeholder notes',
        }),
        views: 5,
        createdAt: new Date('2025-01-15'),
      };

      prismaMock.preGenChangelog.findUnique.mockResolvedValue(mockChangelog as any);
      prismaMock.preGenChangelog.update.mockResolvedValue({ ...mockChangelog, views: 6 } as any);

      const res = await app.request('/abc123');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe('cl-1');
      expect(data.repoOwner).toBe('my-org');
      expect(data.repoName).toBe('my-repo');
      expect(data.title).toBe('v1.0.0 Release Notes');
      expect(data.notes.customer).toBe('Customer-facing notes');
      expect(data.notes.developer).toBe('Developer notes');

      expect(prismaMock.preGenChangelog.findUnique).toHaveBeenCalledWith({
        where: { slug: 'abc123' },
      });

      expect(prismaMock.preGenChangelog.update).toHaveBeenCalledWith({
        where: { id: 'cl-1' },
        data: { views: { increment: 1 } },
      });
    });

    it('should return 404 for missing slug', async () => {
      prismaMock.preGenChangelog.findUnique.mockResolvedValue(null);

      const res = await app.request('/nonexistent');

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('Preview not found');

      expect(prismaMock.preGenChangelog.update).not.toHaveBeenCalled();
    });

    it('should handle plain text body as fallback', async () => {
      const mockChangelog = {
        id: 'cl-2',
        slug: 'def456',
        repoOwner: 'my-org',
        repoName: 'my-repo',
        title: 'Plain text release',
        body: 'This is just plain text, not JSON',
        views: 0,
        createdAt: new Date('2025-02-01'),
      };

      prismaMock.preGenChangelog.findUnique.mockResolvedValue(mockChangelog as any);
      prismaMock.preGenChangelog.update.mockResolvedValue({ ...mockChangelog, views: 1 } as any);

      const res = await app.request('/def456');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.notes).toEqual({ customer: 'This is just plain text, not JSON' });
    });
  });
});

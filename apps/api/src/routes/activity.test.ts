import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockDeep } from 'jest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';

const prismaMock = mockDeep<PrismaClient>();

jest.unstable_mockModule('../lib/db.js', () => ({
  prisma: prismaMock,
}));

jest.unstable_mockModule('../lib/auth.js', () => ({
  requireAuth: jest.fn<any>(async (c: any, next: any) => {
    c.set('user', {
      id: 'user-1',
      githubId: 123,
      login: 'testuser',
      email: 'test@example.com',
    });
    await next();
  }),
}));

const { activity } = await import('./activity.js');

describe('Activity Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/', activity);
    jest.clearAllMocks();
  });

  describe('GET /', () => {
    it('should return recent releases', async () => {
      prismaMock.release.findMany.mockResolvedValue([
        {
          id: 'r1',
          tagName: 'v1.0.0',
          repo: { name: 'repo-1', owner: 'owner-1' }
        } as any
      ]);

      const res = await app.request('/');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.releases).toHaveLength(1);
      expect(data.releases[0].tagName).toBe('v1.0.0');

      expect(prismaMock.release.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          repo: expect.objectContaining({
            userId: 'user-1'
          })
        })
      }));
    });
  });
});

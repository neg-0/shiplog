import { Hono } from 'hono';
import { activity } from './activity.js';
import { prisma } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';

// Mock dependencies
jest.mock('../lib/db.js');
jest.mock('../lib/auth.js');

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
const mockUser = {
  id: 'user-1',
  githubId: 123,
  login: 'testuser',
  email: 'test@example.com',
};

describe('Activity Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    // Default auth mock
    (requireAuth as jest.Mock).mockImplementation(async (c: any, next: any) => {
      c.set('user', mockUser);
      await next();
    });

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
            userId: mockUser.id
          })
        })
      }));
    });
  });
});

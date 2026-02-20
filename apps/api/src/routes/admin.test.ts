import { Hono } from 'hono';
import { admin } from './admin.js';
import { prisma } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';

// Mock dependencies
jest.mock('../lib/db.js');
jest.mock('../lib/auth.js');

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
const mockAdminUser = {
  id: 'admin-1',
  githubId: 123,
  login: 'admin',
  email: 'admin@example.com',
};

const mockRegularUser = {
  id: 'user-1',
  githubId: 456,
  login: 'user',
  email: 'user@example.com',
};

describe('Admin Routes', () => {
  let app: Hono;

  beforeEach(() => {
    process.env.ADMIN_EMAILS = 'admin@example.com';

    app = new Hono();
    app.route('/', admin);

    // Default to admin user
    (requireAuth as jest.Mock).mockImplementation(async (c: any, next: any) => {
      c.set('user', mockAdminUser);
      await next();
    });

    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  describe('Authorization', () => {
    it('should allow admin user', async () => {
      prismaMock.user.count.mockResolvedValue(10);
      prismaMock.repo.count.mockResolvedValue(5);
      prismaMock.release.count.mockResolvedValue(2);

      const res = await app.request('/metrics');

      expect(res.status).toBe(200);
    });

    it('should deny regular user', async () => {
      (requireAuth as jest.Mock).mockImplementation(async (c: any, next: any) => {
        c.set('user', mockRegularUser);
        await next();
      });

      const res = await app.request('/metrics');

      expect(res.status).toBe(403);
    });
  });

  describe('GET /metrics', () => {
    it('should return metrics', async () => {
      prismaMock.user.count.mockResolvedValueOnce(100); // total
      prismaMock.user.count.mockResolvedValueOnce(50); // free
      prismaMock.user.count.mockResolvedValueOnce(30); // pro
      prismaMock.user.count.mockResolvedValueOnce(20); // team
      prismaMock.repo.count.mockResolvedValue(500);
      prismaMock.release.count.mockResolvedValue(200);

      const res = await app.request('/metrics');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.users.total).toBe(100);
      expect(data.users.free).toBe(50);
      expect(data.users.pro).toBe(30);
      expect(data.users.team).toBe(20);
      expect(data.repos).toBe(500);
      expect(data.releases).toBe(200);
      // MRR: 30*29 + 20*79 = 870 + 1580 = 2450
      expect(data.mrr).toBe(2450);
    });
  });

  describe('GET /users', () => {
    it('should list users with pagination and search', async () => {
      prismaMock.user.findMany.mockResolvedValue([
        {
          id: 'u1',
          login: 'u1',
          email: 'u1@example.com',
          _count: { repos: 5 }
        } as any
      ]);
      prismaMock.user.count.mockResolvedValue(1);

      const res = await app.request('/users?page=1&limit=10&search=test&tier=PRO');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.users).toHaveLength(1);
      expect(data.users[0].repoCount).toBe(5);

      expect(prismaMock.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { email: { contains: 'test', mode: 'insensitive' } }
          ]),
          subscriptionTier: 'PRO'
        }),
        skip: 0,
        take: 10
      }));
    });
  });

  describe('GET /users/:id', () => {
    it('should return user details', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u1',
        login: 'u1',
        repos: []
      } as any);

      const res = await app.request('/users/u1');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe('u1');
    });

    it('should return 404 if user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const res = await app.request('/users/u1');

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /users/:id', () => {
    it('should update user tier', async () => {
      prismaMock.user.update.mockResolvedValue({
        id: 'u1',
        subscriptionTier: 'PRO'
      } as any);

      const res = await app.request('/users/u1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionTier: 'PRO' }),
      });

      expect(res.status).toBe(200);
      expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'u1' },
        data: { subscriptionTier: 'PRO' }
      }));
    });
  });

  describe('DELETE /users/:id', () => {
    it('should delete user', async () => {
      prismaMock.user.delete.mockResolvedValue({ id: 'u1' } as any);

      const res = await app.request('/users/u1', { method: 'DELETE' });

      expect(res.status).toBe(200);
      expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    });
  });

  describe('GET /activity', () => {
    it('should return recent activity', async () => {
      const now = new Date();
      prismaMock.user.findMany.mockResolvedValue([
        { id: 'u1', login: 'u1', email: 'u1@e.c', subscriptionTier: 'FREE', createdAt: now } as any
      ]);
      prismaMock.release.findMany.mockResolvedValue([
        {
          id: 'r1',
          tagName: 'v1.0',
          createdAt: now,
          repo: { name: 'repo', fullName: 'u1/repo', user: { login: 'u1' } }
        } as any
      ]);

      const res = await app.request('/activity');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.events).toHaveLength(2);
      expect(data.events[0].type).toBeDefined();
    });
  });
});

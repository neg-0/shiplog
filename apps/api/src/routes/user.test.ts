import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockDeep } from 'jest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';

const prismaMock = mockDeep<PrismaClient>();
const mockUser = {
  id: 'user-1',
  githubId: 123,
  login: 'testuser',
  email: 'test@example.com',
};

jest.unstable_mockModule('../lib/db.js', () => ({
  prisma: prismaMock,
}));

jest.unstable_mockModule('../lib/auth.js', () => ({
  requireAuth: jest.fn<any>(async (c: any, next: any) => {
    c.set('user', mockUser);
    await next();
  }),
}));

const { user } = await import('./user.js');

describe('User Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/', user);
    jest.clearAllMocks();
  });

  describe('GET /me', () => {
    it('should return current user info', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUser.id,
        login: mockUser.login,
        name: 'Test User',
        email: mockUser.email,
        _count: { repos: 5 }
      } as any);

      const res = await app.request('/me');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe(mockUser.id);
      expect(data.repoCount).toBe(5);
    });

    it('should return 404 if user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const res = await app.request('/me');

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /me', () => {
    it('should update user profile', async () => {
      prismaMock.user.update.mockResolvedValue({ id: mockUser.id } as any);

      const res = await app.request('/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Name' }),
      });

      expect(res.status).toBe(200);
      expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: mockUser.id },
        data: { name: 'New Name' }
      }));
    });
  });

  describe('DELETE /me', () => {
    it('should delete user account', async () => {
      prismaMock.user.delete.mockResolvedValue({ id: mockUser.id } as any);

      const res = await app.request('/me', { method: 'DELETE' });

      expect(res.status).toBe(200);
      expect(prismaMock.user.delete).toHaveBeenCalledWith({
        where: { id: mockUser.id }
      });
    });
  });
});

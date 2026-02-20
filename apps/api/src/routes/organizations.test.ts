import { Hono } from 'hono';
import { organizations } from './organizations.js';
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

describe('Organizations Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    // Default auth mock implementation
    (requireAuth as jest.Mock).mockImplementation(async (c: any, next: any) => {
      c.set('user', mockUser);
      await next();
    });

    app.route('/', organizations);
    jest.clearAllMocks();
  });

  // ... (previous tests are preserved by previous write_file, wait, write_file overwrites. I need to append or rewrite all.)
  // I will rewrite the whole file including new tests.

  describe('POST /', () => {
    it('should create an organization', async () => {
      const payload = {
        name: 'Test Org',
        slug: 'test-org',
      };

      prismaMock.organization.findUnique.mockResolvedValue(null);
      // Mock transaction
      prismaMock.$transaction.mockImplementation(async (callback: any) => {
          return await callback(prismaMock);
      });

      prismaMock.organization.create.mockResolvedValue({
        id: 'org-1',
        ...payload,
        ownerId: mockUser.id,
        githubOrgId: null,
        githubOrgLogin: null,
        subscriptionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      prismaMock.organizationMember.create.mockResolvedValue({
        id: 'member-1',
        organizationId: 'org-1',
        userId: mockUser.id,
        role: 'OWNER',
        joinedAt: new Date(),
      } as any);

      const res = await app.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.name).toBe(payload.name);
    });

    it('should return error if slug exists', async () => {
      const payload = {
        name: 'Test Org',
        slug: 'existing-org',
      };

      prismaMock.organization.findUnique.mockResolvedValue({ id: 'org-1' } as any);

      const res = await app.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Organization slug already exists');
    });

    it('should validate required fields', async () => {
        const payload = { name: 'Test Org' }; // Missing slug

        const res = await app.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        expect(res.status).toBe(400);
    });
  });

  describe('GET /', () => {
    it('should list organizations for user', async () => {
      prismaMock.organization.findMany.mockResolvedValue([
        {
          id: 'org-1',
          name: 'Org 1',
          slug: 'org-1',
          ownerId: mockUser.id,
          githubOrgId: null,
          githubOrgLogin: null,
          subscriptionId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { members: 1, repos: 2 },
        } as any,
      ]);

      const res = await app.request('/');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.organizations).toHaveLength(1);
      expect(data.organizations[0].name).toBe('Org 1');
    });
  });

  describe('GET /:id', () => {
    it('should return organization details', async () => {
      prismaMock.organization.findFirst.mockResolvedValue({
        id: 'org-1',
        name: 'Org 1',
        slug: 'org-1',
        ownerId: mockUser.id,
        githubOrgId: null,
        githubOrgLogin: null,
        subscriptionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: { id: mockUser.id, login: mockUser.login, name: 'Test User', email: mockUser.email, avatarUrl: null },
        members: [],
        repos: [],
      } as any);

      const res = await app.request('/org-1');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe('org-1');
    });

    it('should return 404 if organization not found', async () => {
      prismaMock.organization.findFirst.mockResolvedValue(null);

      const res = await app.request('/org-1');

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /:id', () => {
    it('should update organization if owner', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        ownerId: mockUser.id,
        members: [{ role: 'OWNER' }],
      } as any);

      prismaMock.organization.update.mockResolvedValue({
        id: 'org-1',
        name: 'Updated Name',
      } as any);

      const res = await app.request('/org-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Name' }),
      });

      expect(res.status).toBe(200);
      expect(prismaMock.organization.update).toHaveBeenCalled();
    });

    it('should deny update if not authorized', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        ownerId: 'other-user',
        members: [{ role: 'MEMBER' }],
      } as any);

      const res = await app.request('/org-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Name' }),
      });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /:id/invite', () => {
    it('should invite a user', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        ownerId: mockUser.id,
        members: [{ role: 'OWNER' }],
      } as any);

      prismaMock.user.findFirst.mockResolvedValue(null); // User doesn't exist yet

      prismaMock.organizationInvite.create.mockResolvedValue({
        id: 'invite-1',
        email: 'invitee@example.com',
      } as any);

      const res = await app.request('/org-1/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'invitee@example.com' }),
      });

      expect(res.status).toBe(201);
      expect(prismaMock.organizationInvite.create).toHaveBeenCalled();
    });

    it('should fail if user is already a member', async () => {
        prismaMock.organization.findUnique.mockResolvedValue({
          id: 'org-1',
          ownerId: mockUser.id,
          members: [{ role: 'OWNER' }],
        } as any);

        prismaMock.user.findFirst.mockResolvedValue({ id: 'existing-user' } as any);
        prismaMock.organizationMember.findFirst.mockResolvedValue({ id: 'member-1' } as any);

        const res = await app.request('/org-1/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'invitee@example.com' }),
        });

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'User is already a member' });
    });
  });

  describe('GET /:id/members', () => {
    it('should list members', async () => {
      prismaMock.organizationMember.findFirst.mockResolvedValue({ id: 'member-1' } as any);
      prismaMock.organizationMember.findMany.mockResolvedValue([
        { id: 'member-1', userId: mockUser.id, role: 'OWNER', user: mockUser } as any
      ]);

      const res = await app.request('/org-1/members');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.members).toHaveLength(1);
    });

    it('should deny if not a member', async () => {
      prismaMock.organizationMember.findFirst.mockResolvedValue(null);

      const res = await app.request('/org-1/members');

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /:id/members/:userId', () => {
    it('should remove a member', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        ownerId: mockUser.id,
        members: [{ role: 'OWNER' }],
      } as any);

      prismaMock.organizationMember.findFirst.mockResolvedValue({ id: 'member-2' } as any);
      prismaMock.organizationMember.delete.mockResolvedValue({ id: 'member-2' } as any);

      const res = await app.request('/org-1/members/user-2', { method: 'DELETE' });

      expect(res.status).toBe(200);
      expect(prismaMock.organizationMember.delete).toHaveBeenCalled();
    });

    it('should not allow removing owner', async () => {
      prismaMock.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        ownerId: mockUser.id,
        members: [{ role: 'OWNER' }],
      } as any);

      const res = await app.request(`/org-1/members/${mockUser.id}`, { method: 'DELETE' });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Cannot remove the organization owner' });
    });
  });

  describe('POST /invites/:id/accept', () => {
    it('should accept an invite', async () => {
      const invite = {
        id: 'invite-1',
        organizationId: 'org-1',
        email: mockUser.email,
        role: 'MEMBER',
        expiresAt: new Date(Date.now() + 100000),
      };

      prismaMock.organizationInvite.findUnique.mockResolvedValue(invite as any);
      prismaMock.organizationMember.upsert.mockResolvedValue({ id: 'member-1' } as any);
      prismaMock.organizationInvite.delete.mockResolvedValue(invite as any);

      const res = await app.request('/invites/invite-1/accept', { method: 'POST' });

      expect(res.status).toBe(200);
      expect(prismaMock.organizationMember.upsert).toHaveBeenCalled();
    });

    it('should fail if invite expired', async () => {
      const invite = {
        id: 'invite-1',
        organizationId: 'org-1',
        email: mockUser.email,
        role: 'MEMBER',
        expiresAt: new Date(Date.now() - 100000),
      };

      prismaMock.organizationInvite.findUnique.mockResolvedValue(invite as any);

      const res = await app.request('/invites/invite-1/accept', { method: 'POST' });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invite has expired' });
    });
  });
});

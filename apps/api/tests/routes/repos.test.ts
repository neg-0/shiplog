import { Hono } from 'hono';
import { prismaMock } from '../setup.js';
import { repos } from '../../src/routes/repos.js';

// Mock verifyToken
jest.mock('../../src/lib/jwt.js', () => ({
  verifyToken: jest.fn().mockResolvedValue({ userId: 'user-1' }),
  signToken: jest.fn(),
}));

const app = new Hono();
app.route('/repos', repos);

describe('Repos Route', () => {
  beforeEach(() => {
    // Default user setup
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      githubId: 123,
      login: 'testuser',
      email: 'test@example.com',
      accessToken: 'encrypted_token',
    } as any);
  });

  describe('GET /repos/:id', () => {
    it('should allow access to own repo', async () => {
      prismaMock.repo.findFirst.mockResolvedValue({
        id: 'repo-1',
        userId: 'user-1',
        name: 'test-repo',
        releases: [],
        config: {},
      } as any);

      const res = await app.request('/repos/repo-1', {
        headers: { 'Authorization': 'Bearer token' }
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('id', 'repo-1');
    });

    it('should allow access to organization repo if member', async () => {
      prismaMock.repo.findFirst.mockResolvedValue({
        id: 'org-repo-1',
        userId: 'other-user',
        organizationId: 'org-1',
        name: 'org-repo',
        releases: [],
        config: {},
      } as any);

      const res = await app.request('/repos/org-repo-1', {
        headers: { 'Authorization': 'Bearer token' }
      });

      expect(res.status).toBe(200);

      // Check validation logic
      const callArgs = prismaMock.repo.findFirst.mock.calls[0][0];
      expect(callArgs?.where).toEqual(expect.objectContaining({
        id: 'org-repo-1',
        OR: expect.arrayContaining([
          { userId: 'user-1' },
          { organization: { members: { some: { userId: 'user-1' } } } }
        ])
      }));
    });

    it('should deny access if not owner and not org member', async () => {
      prismaMock.repo.findFirst.mockResolvedValue(null);

      const res = await app.request('/repos/repo-2', {
        headers: { 'Authorization': 'Bearer token' }
      });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /repos/:id', () => {
    it('should deny deletion if not admin/owner', async () => {
       // Mock checkRepoAdmin returning null
       prismaMock.repo.findUnique.mockResolvedValue({
         id: 'repo-1',
         userId: 'other-user', // Not owner
         organizationId: 'org-1',
         organization: { members: [{ role: 'MEMBER' }] } // Not admin
       } as any);

       const res = await app.request('/repos/repo-1', {
         method: 'DELETE',
         headers: { 'Authorization': 'Bearer token' }
       });

       expect(res.status).toBe(404);
    });

    it('should allow deletion if org admin', async () => {
       prismaMock.repo.findUnique.mockResolvedValue({
         id: 'repo-1',
         userId: 'other-user',
         organizationId: 'org-1',
         organization: { members: [{ role: 'ADMIN' }] }
       } as any);

       // Also mocks for deletion
       prismaMock.user.findUnique.mockResolvedValue({ accessToken: 'encrypted' } as any);
       prismaMock.repo.delete.mockResolvedValue({ fullName: 'test/repo' } as any);

       const res = await app.request('/repos/repo-1', {
         method: 'DELETE',
         headers: { 'Authorization': 'Bearer token' }
       });

       expect(res.status).toBe(200);
    });
  });
});

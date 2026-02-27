import { Hono } from 'hono';

// We need to mock jwt before importing admin
jest.mock('../../src/lib/jwt.js', () => ({
  verifyToken: jest.fn().mockResolvedValue({ userId: 'admin-user' }),
}));

describe('Admin Route', () => {
  let app: Hono;
  let prismaMock: any;

  beforeEach(async () => {
    jest.resetModules();
    process.env.ADMIN_EMAILS = 'admin@example.com';

    // Import admin and setup AFTER resetModules
    const { admin } = await import('../../src/routes/admin.js');
    const { prisma } = await import('../../src/lib/db.js');

    // Since lib/db.js is mocked by setup.ts (globally via jest.mock in setup.ts?),
    // Wait, jest.mock is hoisted from setup.ts?
    // setup.ts runs via setupFilesAfterEnv.
    // jest.mock calls in setup.ts affect the whole suite.
    // So importing lib/db.js should return the mock.

    prismaMock = prisma;

    app = new Hono();
    app.route('/admin', admin);
  });

  it('should allow access if user is admin', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'admin-user',
      email: 'admin@example.com',
    } as any);

    prismaMock.user.count.mockResolvedValue(10);
    prismaMock.repo.count.mockResolvedValue(5);
    prismaMock.release.count.mockResolvedValue(2);

    const res = await app.request('/admin/metrics', {
      headers: { 'Authorization': 'Bearer token' }
    });

    expect(res.status).toBe(200);
  });

  it('should deny access if user is not admin', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'admin-user',
      email: 'user@example.com',
    } as any);

    const res = await app.request('/admin/metrics', {
      headers: { 'Authorization': 'Bearer token' }
    });

    expect(res.status).toBe(403);
  });
});

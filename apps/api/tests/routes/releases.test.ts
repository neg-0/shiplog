import { Hono } from 'hono';
import { prismaMock } from '../setup.js';
import { releases } from '../../src/routes/releases.js';

jest.mock('../../src/lib/jwt.js', () => ({
  verifyToken: jest.fn().mockResolvedValue({ userId: 'user-1' }),
}));

jest.mock('../../src/lib/sanitize.js', () => ({
  sanitizeHtml: jest.fn((str) => `SANITIZED:${str}`),
}));

const app = new Hono();
app.route('/releases', releases);

describe('Releases Route', () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
    } as any);
  });

  describe('PATCH /releases/:id/notes', () => {
    it('should sanitize XSS input', async () => {
      prismaMock.release.findFirst.mockResolvedValue({
        id: 'rel-1',
        repo: { userId: 'user-1' },
        notes: { id: 'notes-1' },
      } as any);

      prismaMock.generatedNotes.update.mockResolvedValue({} as any);

      const res = await app.request('/releases/rel-1/notes', {
        method: 'PATCH',
        headers: {
            'Authorization': 'Bearer token',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          customer: '<script>alert(1)</script>Hello',
        })
      });

      expect(res.status).toBe(200);

      const updateCall = prismaMock.generatedNotes.update.mock.calls[0][0];
      // Check if sanitizer was applied
      expect(updateCall.data.customer).toBe('SANITIZED:<script>alert(1)</script>Hello');
    });

    it('should check access using OR clause', async () => {
      prismaMock.release.findFirst.mockResolvedValue({
        id: 'rel-1',
        repo: { userId: 'user-1' },
        notes: { id: 'notes-1' },
      } as any);

      await app.request('/releases/rel-1/notes', {
        method: 'PATCH',
        headers: {
            'Authorization': 'Bearer token',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ customer: 'test' })
      });

      const findCall = prismaMock.release.findFirst.mock.calls[0][0];
      expect(findCall?.where?.repo).toEqual(expect.objectContaining({
        OR: expect.arrayContaining([
            { userId: 'user-1' },
            { organization: { members: { some: { userId: 'user-1' } } } }
        ])
      }));
    });
  });
});

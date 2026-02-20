import { Hono } from 'hono';

// Mock sanitize to avoid loading isomorphic-dompurify which causes Jest syntax error
jest.mock('../../src/lib/sanitize.js', () => ({
  sanitizeHtml: jest.fn((str) => str),
}));

import { publicChangelog } from '../../src/routes/public.js';

const app = new Hono();
app.route('/public', publicChangelog);

describe('Public Route', () => {
  it('should enforce rate limits on feedback', async () => {
    // 6 requests, limit is 5
    for (let i = 0; i < 5; i++) {
      const res = await app.request('/public/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoId: '1', feedback: 'test' })
      });
      // Depending on validation, it might be 200 or 400, but not 429 yet
      if (res.status === 429) fail('Should not be rate limited yet');
    }

    const res = await app.request('/public/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoId: '1', feedback: 'test' })
      });

    expect(res.status).toBe(429);
  });
});

import { Hono } from 'hono';
import { feedback } from './feedback.js';
import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';

describe('Feedback Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/', feedback);
    jest.clearAllMocks();
    process.env.DISCORD_FEEDBACK_WEBHOOK_URL = 'https://discord.com/api/webhooks/test';
  });

  afterEach(() => {
    delete process.env.DISCORD_FEEDBACK_WEBHOOK_URL;
  });

  describe('POST /', () => {
    it('should submit feedback successfully', async () => {
      (global.fetch as jest.Mock<any>).mockResolvedValue({
        ok: true,
      });

      const payload = {
        type: 'feature',
        message: 'Great app!',
        email: 'user@example.com',
        page: '/dashboard',
      };

      const res = await app.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://discord.com/api/webhooks/test',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Great app!'),
        })
      );
    });

    it('should validate input', async () => {
      const payload = {
        type: 'invalid-type', // Invalid enum
        message: '', // Too short
      };

      const res = await app.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(400);
    });

    it('should handle missing webhook url gracefully', async () => {
      delete process.env.DISCORD_FEEDBACK_WEBHOOK_URL;

      const payload = {
        type: 'bug',
        message: 'Something broke',
      };

      const res = await app.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain('simulation');

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle webhook error', async () => {
      (global.fetch as jest.Mock<any>).mockResolvedValue({
        ok: false,
        text: async () => 'Error message',
      });

      const payload = {
        type: 'bug',
        message: 'Something broke',
      };

      const res = await app.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
    });
  });
});

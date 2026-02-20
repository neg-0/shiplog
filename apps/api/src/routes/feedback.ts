import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

/**
 * @module feedback
 * @description Routes for submitting user feedback.
 */
export const feedback = new Hono();

const feedbackSchema = z.object({
  type: z.enum(['bug', 'feature', 'other', 'praise']),
  message: z.string().min(1).max(2000),
  email: z.string().email().optional().or(z.literal('')),
  page: z.string().optional(),
  userId: z.string().optional(),
});

/**
 * POST /
 * @description Submit feedback to the system (forwarded to Discord webhook).
 * @body {object} feedback - Feedback data.
 * @body {string} feedback.type - Type of feedback (bug, feature, praise, other).
 * @body {string} feedback.message - The feedback content.
 * @body {string} [feedback.email] - User's email (optional).
 * @body {string} [feedback.page] - Page where feedback was submitted (optional).
 * @body {string} [feedback.userId] - User ID (optional).
 * @returns {object} Success status.
 */
feedback.post('/', zValidator('json', feedbackSchema), async (c) => {
  const data = c.req.valid('json');
  const webhookUrl = process.env.DISCORD_FEEDBACK_WEBHOOK_URL;

  console.log('📝 Received feedback:', data);

  if (!webhookUrl) {
    console.warn('⚠️ DISCORD_FEEDBACK_WEBHOOK_URL is not set. Feedback will not be sent to Discord.');
    // We still return success to the client so the UI doesn't break
    return c.json({ success: true, message: 'Feedback received (simulation)' });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title: `New Feedback: ${data.type.toUpperCase()}`,
            color: getColorForType(data.type),
            fields: [
              { name: 'Message', value: data.message },
              { name: 'User', value: data.email || data.userId || 'Anonymous', inline: true },
              { name: 'Page', value: data.page || 'Unknown', inline: true },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('Failed to send feedback to Discord:', await response.text());
      return c.json({ success: false, error: 'Failed to forward feedback' }, 500);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error sending feedback:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

function getColorForType(type: string): number {
  switch (type) {
    case 'bug': return 0xE74C3C; // Red
    case 'feature': return 0x3498DB; // Blue
    case 'praise': return 0x2ECC71; // Green
    default: return 0x95A5A6; // Gray
  }
}

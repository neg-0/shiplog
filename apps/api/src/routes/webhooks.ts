import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'crypto';

export const webhooks = new Hono();

// Verify GitHub webhook signature
function verifyGitHubSignature(payload: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  
  const hmac = createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch {
    return false;
  }
}

webhooks.post('/github', async (c) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.error('GITHUB_WEBHOOK_SECRET not configured');
    return c.json({ error: 'Webhook not configured' }, 500);
  }

  // Get raw body for signature verification
  const body = await c.req.text();
  const signature = c.req.header('x-hub-signature-256');
  
  if (!verifyGitHubSignature(body, signature, secret)) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  const event = c.req.header('x-github-event');
  const payload = JSON.parse(body);

  console.log(`📥 Received GitHub webhook: ${event}`);

  // Handle release events
  if (event === 'release' && payload.action === 'published') {
    const release = payload.release;
    const repo = payload.repository;

    console.log(`🚀 New release: ${repo.full_name} @ ${release.tag_name}`);
    
    // TODO: Queue release processing job
    // - Fetch PRs/commits between tags
    // - Generate 3 versions of notes
    // - Distribute to configured channels
    
    return c.json({
      status: 'accepted',
      release: release.tag_name,
      repo: repo.full_name,
    });
  }

  // Acknowledge other events
  return c.json({ status: 'ignored', event });
});

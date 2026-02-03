import { Hono } from 'hono';

export const repos = new Hono();

// List user's connected repos
repos.get('/', async (c) => {
  // TODO: Get user from session
  // TODO: Fetch repos from database
  
  return c.json({
    repos: [],
    message: 'Not implemented yet',
  });
});

// Get single repo config
repos.get('/:id', async (c) => {
  const id = c.req.param('id');
  
  // TODO: Fetch repo config from database
  
  return c.json({
    id,
    message: 'Not implemented yet',
  });
});

// Update repo config (channels, emails, settings)
repos.patch('/:id/config', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  
  // TODO: Validate and update config
  
  console.log(`📝 Updating config for repo ${id}:`, body);
  
  return c.json({
    id,
    updated: true,
    message: 'Not implemented yet',
  });
});

// Connect a new repo (create webhook)
repos.post('/connect', async (c) => {
  const body = await c.req.json() as { owner: string; repo: string };
  
  // TODO:
  // - Verify user has access to repo
  // - Create GitHub webhook
  // - Store repo in database
  
  console.log(`🔗 Connecting repo: ${body.owner}/${body.repo}`);
  
  return c.json({
    status: 'connected',
    repo: `${body.owner}/${body.repo}`,
    message: 'Not implemented yet',
  });
});

// Disconnect a repo (remove webhook)
repos.delete('/:id', async (c) => {
  const id = c.req.param('id');
  
  // TODO:
  // - Remove GitHub webhook
  // - Delete repo from database
  
  console.log(`🔌 Disconnecting repo: ${id}`);
  
  return c.json({
    status: 'disconnected',
    id,
    message: 'Not implemented yet',
  });
});

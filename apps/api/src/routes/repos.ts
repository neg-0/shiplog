import { Hono } from 'hono';
import { prisma } from '../lib/db.js';
import { requireAuth, decrypt } from '../lib/auth.js';
import { listUserRepos, createWebhook, deleteWebhook } from '../services/github.js';

export const repos = new Hono();

const API_URL = process.env.API_URL || 'http://localhost:3001';

// All routes require auth
repos.use('*', requireAuth);

// List user's connected repos
repos.get('/', async (c) => {
  const user = c.get('user');
  
  const connectedRepos = await prisma.repo.findMany({
    where: { userId: user.id },
    include: {
      releases: {
        orderBy: { publishedAt: 'desc' },
        take: 1,
        select: {
          tagName: true,
          publishedAt: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return c.json({
    repos: connectedRepos.map(repo => ({
      id: repo.id,
      githubId: repo.githubId,
      name: repo.name,
      fullName: repo.fullName,
      description: repo.description,
      status: repo.status,
      lastRelease: repo.releases[0]?.tagName ?? null,
      lastReleaseDate: repo.releases[0]?.publishedAt ?? null,
    })),
  });
});

// Get single repo detail
repos.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  
  const repo = await prisma.repo.findFirst({
    where: { 
      id,
      userId: user.id,
    },
    include: {
      config: true,
      releases: {
        orderBy: { publishedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          tagName: true,
          name: true,
          publishedAt: true,
          status: true,
        },
      },
    },
  });

  if (!repo) {
    return c.json({ error: 'Repository not found' }, 404);
  }

  return c.json({
    id: repo.id,
    githubId: repo.githubId,
    name: repo.name,
    fullName: repo.fullName,
    owner: repo.owner,
    description: repo.description,
    status: repo.status,
    webhookActive: repo.webhookActive,
    config: repo.config,
    releases: repo.releases.map(r => ({
      id: r.id,
      tagName: r.tagName,
      name: r.name,
      publishedAt: r.publishedAt,
      status: r.status,
    })),
  });
});

// List available GitHub repos (not yet connected)
repos.get('/github/available', async (c) => {
  const user = c.get('user');

  // Get user's access token
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { accessToken: true },
  });

  if (!dbUser?.accessToken) {
    return c.json({ error: 'No GitHub access token' }, 401);
  }

  const accessToken = await decrypt(dbUser.accessToken);
  const githubRepos = await listUserRepos(accessToken);

  // Get already connected repo IDs
  const connectedRepos = await prisma.repo.findMany({
    where: { userId: user.id },
    select: { githubId: true },
  });
  const connectedIds = new Set(connectedRepos.map(r => r.githubId));

  // Filter out already connected repos
  const availableRepos = githubRepos.filter(r => !connectedIds.has(r.id));

  return c.json({
    repos: availableRepos.map(r => ({
      githubId: r.id,
      name: r.name,
      fullName: r.full_name,
      owner: r.owner,
      description: r.description,
    })),
  });
});

// Connect a new repo (create webhook)
repos.post('/connect', async (c) => {
  const user = c.get('user');
  const body = await c.req.json() as { 
    githubId: number;
    owner: string; 
    repo: string;
    fullName: string;
    description?: string;
  };

  // Get user's access token
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { accessToken: true },
  });

  if (!dbUser?.accessToken) {
    return c.json({ error: 'No GitHub access token' }, 401);
  }

  const accessToken = await decrypt(dbUser.accessToken);

  // Check if already connected
  const existing = await prisma.repo.findFirst({
    where: { 
      githubId: body.githubId,
      userId: user.id,
    },
  });

  if (existing) {
    return c.json({ error: 'Repository already connected' }, 400);
  }

  // Generate webhook secret
  const webhookSecret = crypto.randomUUID();
  const webhookUrl = `${API_URL}/webhooks/github`;

  try {
    // Create GitHub webhook
    const { id: webhookId } = await createWebhook(
      body.owner,
      body.repo,
      webhookUrl,
      webhookSecret,
      accessToken
    );

    // Store in database
    const repo = await prisma.repo.create({
      data: {
        githubId: body.githubId,
        name: body.repo,
        fullName: body.fullName,
        owner: body.owner,
        description: body.description ?? null,
        webhookId,
        webhookSecret,
        webhookActive: true,
        status: 'ACTIVE',
        userId: user.id,
      },
      include: {
        config: true,
      },
    });

    // Create default config
    await prisma.repoConfig.create({
      data: {
        repoId: repo.id,
        autoGenerate: true,
        autoPublish: false,
        generateCustomer: true,
        generateDeveloper: true,
        generateStakeholder: true,
      },
    });

    console.log(`🔗 Connected repo: ${body.fullName} (webhook ID: ${webhookId})`);

    return c.json({
      status: 'connected',
      id: repo.id,
      fullName: repo.fullName,
      webhookActive: true,
    });

  } catch (error) {
    console.error('Failed to connect repo:', error);
    
    // Still create the repo but mark webhook as failed
    const repo = await prisma.repo.create({
      data: {
        githubId: body.githubId,
        name: body.repo,
        fullName: body.fullName,
        owner: body.owner,
        description: body.description ?? null,
        webhookActive: false,
        status: 'ERROR',
        userId: user.id,
      },
    });

    return c.json({
      status: 'partial',
      id: repo.id,
      fullName: repo.fullName,
      webhookActive: false,
      error: 'Failed to create webhook - you may need to create it manually',
    }, 201);
  }
});

// Update repo config
repos.patch('/:id/config', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json() as {
    autoGenerate?: boolean;
    autoPublish?: boolean;
    generateCustomer?: boolean;
    generateDeveloper?: boolean;
    generateStakeholder?: boolean;
    customerTone?: string;
    companyName?: string;
    productName?: string;
  };

  // Verify ownership
  const repo = await prisma.repo.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });

  if (!repo) {
    return c.json({ error: 'Repository not found' }, 404);
  }

  const config = await prisma.repoConfig.upsert({
    where: { repoId: id },
    create: {
      repoId: id,
      ...body,
    },
    update: body,
  });

  console.log(`📝 Updated config for repo ${id}`);

  return c.json({
    id: config.id,
    repoId: config.repoId,
    ...config,
  });
});

// Disconnect a repo (remove webhook)
repos.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const repo = await prisma.repo.findFirst({
    where: { id, userId: user.id },
  });

  if (!repo) {
    return c.json({ error: 'Repository not found' }, 404);
  }

  // Try to delete webhook from GitHub
  if (repo.webhookId) {
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { accessToken: true },
      });

      if (dbUser?.accessToken) {
        const accessToken = await decrypt(dbUser.accessToken);
        await deleteWebhook(repo.owner, repo.name, repo.webhookId, accessToken);
      }
    } catch (error) {
      console.warn('Failed to delete GitHub webhook:', error);
      // Continue with deletion anyway
    }
  }

  // Delete from database (cascades to config, releases, etc.)
  await prisma.repo.delete({
    where: { id },
  });

  console.log(`🔌 Disconnected repo: ${repo.fullName}`);

  return c.json({
    status: 'disconnected',
    id,
    fullName: repo.fullName,
  });
});

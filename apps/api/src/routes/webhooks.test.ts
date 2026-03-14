import { jest } from '@jest/globals';
import { createHmac } from 'crypto';

// Mocks
const prismaMock = {
  repo: {
    findFirst: jest.fn<any>(),
  },
  release: {
    create: jest.fn<any>(),
    findUnique: jest.fn<any>(),
    update: jest.fn<any>(),
  },
  generatedNotes: {
    create: jest.fn<any>(),
  },
  distribution: {
    createMany: jest.fn<any>(),
  },
};

const githubMock = {
  fetchReleaseData: jest.fn<any>(),
};

const generatorMock = {
  generateReleaseNotes: jest.fn<any>(),
};

const distributorMock = {
  distributeReleaseWithResults: jest.fn<any>(),
};

const authMock = {
  decrypt: jest.fn<any>(),
};

// Mock modules
jest.unstable_mockModule('../lib/db.js', () => ({
  prisma: prismaMock,
}));
jest.unstable_mockModule('../services/github.js', () => githubMock);
jest.unstable_mockModule('../services/generator.js', () => generatorMock);
jest.unstable_mockModule('../services/distributor.js', () => distributorMock);
jest.unstable_mockModule('../lib/auth.js', () => authMock);

// Import the app (must be after mocks)
const { webhooks } = await import('./webhooks.js');

describe('Webhooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validPayload = {
    action: 'published',
    release: {
      id: 12345,
      tag_name: 'v1.0.0',
      name: 'Version 1.0.0',
      body: 'Release notes',
      html_url: 'https://github.com/owner/repo/releases/tag/v1.0.0',
      draft: false,
      prerelease: false,
      published_at: '2024-01-01T00:00:00Z',
    },
    repository: {
      full_name: 'owner/repo',
      name: 'repo',
      owner: { login: 'owner' },
    },
  };

  const secret = 'test-secret';

  const generateSignature = (payload: any, secretKey: string) => {
    const hmac = createHmac('sha256', secretKey);
    const digest = 'sha256=' + hmac.update(JSON.stringify(payload)).digest('hex');
    return digest;
  };

  test('should return 401 if signature is missing', async () => {
    const res = await webhooks.request('/github', {
      method: 'POST',
      body: JSON.stringify(validPayload),
      headers: {
        'x-github-event': 'release',
      },
    });

    expect(res.status).toBe(401);
    const body = await res.json() as any;
    expect(body).toEqual({ error: 'No signature' });

    // Ensure DB was NOT queried
    expect(prismaMock.repo.findFirst).not.toHaveBeenCalled();
  });

  test('should return 401 if signature is invalid', async () => {
    // Current implementation queries DB to verify signature, so we mock it finding a repo
    prismaMock.repo.findFirst.mockResolvedValue({
      id: 'repo-1',
      webhookSecret: secret,
      webhookActive: true,
      user: { accessToken: 'encrypted-token' },
      config: {},
    });

    const res = await webhooks.request('/github', {
      method: 'POST',
      body: JSON.stringify(validPayload),
      headers: {
        'x-github-event': 'release',
        'x-hub-signature-256': 'sha256=invalid',
      },
    });

    expect(res.status).toBe(401);
    const body = await res.json() as any;
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  test('should return 401 if webhook secret is missing in DB', async () => {
    prismaMock.repo.findFirst.mockResolvedValue({
      id: 'repo-1',
      webhookSecret: null, // No secret configured
      webhookActive: true,
    });

    const res = await webhooks.request('/github', {
      method: 'POST',
      body: JSON.stringify(validPayload),
      headers: {
        'x-github-event': 'release',
        'x-hub-signature-256': generateSignature(validPayload, 'any-secret'),
      },
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  test('should process valid release event', async () => {
    prismaMock.repo.findFirst.mockResolvedValue({
      id: 'repo-1',
      webhookSecret: secret,
      webhookActive: true,
      user: { accessToken: 'encrypted-token' },
      config: {
        channels: [],
        emailRecipients: [],
      },
      name: 'repo',
      owner: 'owner',
      fullName: 'owner/repo',
    });

    authMock.decrypt.mockResolvedValue('decrypted-token');

    githubMock.fetchReleaseData.mockResolvedValue({
      release: {
        id: 12345,
        tagName: 'v1.0.0',
        name: 'Version 1.0.0',
        body: 'Release notes',
        htmlUrl: 'https://github.com/owner/repo/releases/tag/v1.0.0',
        isDraft: false,
        isPrerelease: false,
        publishedAt: new Date(),
      },
      previousTag: 'v0.9.0',
      commits: [],
      pullRequests: [],
    });

    generatorMock.generateReleaseNotes.mockResolvedValue({
      customer: 'Notes',
      developer: 'Notes',
      stakeholder: 'Notes',
      tokensUsed: 100,
      model: 'gpt-4',
    });

    prismaMock.release.create.mockResolvedValue({
      id: 'release-1',
    });

    distributorMock.distributeReleaseWithResults.mockResolvedValue([]);

    const res = await webhooks.request('/github', {
      method: 'POST',
      body: JSON.stringify(validPayload),
      headers: {
        'x-github-event': 'release',
        'x-hub-signature-256': generateSignature(validPayload, secret),
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'processed' });

    expect(prismaMock.repo.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ fullName: 'owner/repo' })
    }));
    expect(generatorMock.generateReleaseNotes).toHaveBeenCalled();
    expect(prismaMock.release.create).toHaveBeenCalled();
  });

  test('should prevent replay attacks (idempotency)', async () => {
    // Setup: Repo exists
    prismaMock.repo.findFirst.mockResolvedValue({
      id: 'repo-1',
      webhookSecret: secret,
      webhookActive: true,
      user: { accessToken: 'encrypted-token' },
      config: {},
      name: 'repo',
      owner: 'owner',
      fullName: 'owner/repo',
    });

    // Setup: Release ALREADY exists
    prismaMock.release.findUnique.mockResolvedValue({
      id: 'release-1',
      githubId: 12345,
    });

    const res = await webhooks.request('/github', {
      method: 'POST',
      body: JSON.stringify(validPayload),
      headers: {
        'x-github-event': 'release',
        'x-hub-signature-256': generateSignature(validPayload, secret),
      },
    });

    // Expect ignored status
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toEqual({ status: 'ignored', reason: 'already_processed' });

    // Expect NO generation or distribution
    expect(generatorMock.generateReleaseNotes).not.toHaveBeenCalled();
    expect(distributorMock.distributeReleaseWithResults).not.toHaveBeenCalled();
    expect(prismaMock.release.create).not.toHaveBeenCalled();
  });
});

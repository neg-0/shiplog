import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Hono } from 'hono';

// Mock DB
const mockPrisma = {
  repo: { findFirst: jest.fn<any>() },
  release: { create: jest.fn<any>(), update: jest.fn<any>() },
  generatedNotes: { create: jest.fn<any>() },
  distribution: { createMany: jest.fn<any>() },
};

jest.mock('../../src/lib/db.js', () => ({
  prisma: mockPrisma,
}));

// Mock GitHub service
const mockFetchReleaseData = jest.fn<any>();
jest.mock('../../src/services/github.js', () => ({
  fetchReleaseData: mockFetchReleaseData,
}));

// Mock Generator
const mockGenerateReleaseNotes = jest.fn<any>();
jest.mock('../../src/services/generator.js', () => ({
  generateReleaseNotes: mockGenerateReleaseNotes,
}));

// Mock Distributor
const mockDistribute = jest.fn<any>();
jest.mock('../../src/services/distributor.js', () => ({
  distributeReleaseWithResults: mockDistribute,
}));

// Mock Auth
jest.mock('../../src/lib/auth.js', () => ({
  decrypt: jest.fn<any>().mockResolvedValue('token'),
}));

// Mock Logger
jest.mock('../../src/lib/logger.js', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
}));

// Mock crypto
import crypto from 'crypto';
jest.mock('crypto', () => ({
  createHmac: jest.fn(() => ({
    update: jest.fn(() => ({
      digest: jest.fn(() => 'mock-signature'),
    })),
  })),
  timingSafeEqual: jest.fn(() => true),
}));

// Import app after mocking
import { webhooks } from '../../src/routes/webhooks';

describe('Webhooks Route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockPayload = {
    action: 'published',
    release: { tag_name: 'v1.0.0', id: 123, html_url: 'url' },
    repository: { full_name: 'owner/repo' },
  };

  const mockRepo = {
    id: 'repo-id',
    fullName: 'owner/repo',
    webhookSecret: 'secret',
    user: { accessToken: 'encrypted' },
    config: { channels: [], emailRecipients: [] },
    owner: 'owner',
    name: 'repo',
  };

  it('should process release successfully', async () => {
    mockPrisma.repo.findFirst.mockResolvedValue(mockRepo);
    mockFetchReleaseData.mockResolvedValue({
      release: { id: 1, tagName: 'v1.0.0', name: 'v1.0.0', body: 'body', htmlUrl: 'url' },
      commits: [],
      pullRequests: [],
    });
    mockPrisma.release.create.mockResolvedValue({ id: 'release-id' });
    mockGenerateReleaseNotes.mockResolvedValue({
      customer: 'notes',
      developer: 'notes',
      stakeholder: 'notes',
      tokensUsed: 10,
    });
    mockDistribute.mockResolvedValue([
      { success: true, target: { type: 'slack', audience: 'customer' } }
    ]);

    const req = new Request('http://localhost/github', {
      method: 'POST',
      headers: {
        'x-github-event': 'release',
        'x-hub-signature-256': 'sha256=mock-signature',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mockPayload),
    });

    const res = await webhooks.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('PUBLISHED');
    expect(mockPrisma.release.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PUBLISHED' })
    }));
  });

  it('should handle generation failure', async () => {
    mockPrisma.repo.findFirst.mockResolvedValue(mockRepo);
    mockFetchReleaseData.mockResolvedValue({
      release: { id: 1, tagName: 'v1.0.0', name: 'v1.0.0', body: 'body', htmlUrl: 'url' },
      commits: [],
      pullRequests: [],
    });
    mockPrisma.release.create.mockResolvedValue({ id: 'release-id' });
    mockGenerateReleaseNotes.mockRejectedValue(new Error('Generation failed'));

    const req = new Request('http://localhost/github', {
      method: 'POST',
      headers: {
        'x-github-event': 'release',
        'x-hub-signature-256': 'sha256=mock-signature',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mockPayload),
    });

    const res = await webhooks.fetch(req);
    expect(res.status).toBe(500);

    expect(mockPrisma.release.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'release-id' },
      data: expect.objectContaining({ status: 'FAILED' })
    }));
  });

  it('should handle partial distribution failure', async () => {
    mockPrisma.repo.findFirst.mockResolvedValue(mockRepo);
    mockFetchReleaseData.mockResolvedValue({
      release: { id: 1, tagName: 'v1.0.0', name: 'v1.0.0', body: 'body', htmlUrl: 'url' },
      commits: [],
      pullRequests: [],
    });
    mockPrisma.release.create.mockResolvedValue({ id: 'release-id' });
    mockGenerateReleaseNotes.mockResolvedValue({
      customer: 'notes',
      developer: 'notes',
      stakeholder: 'notes',
      tokensUsed: 10,
    });

    // One success, one failure
    mockDistribute.mockResolvedValue([
      { success: true, target: { type: 'slack', audience: 'customer' } },
      { success: false, target: { type: 'discord', audience: 'developer' }, error: 'failed' }
    ]);

    const req = new Request('http://localhost/github', {
      method: 'POST',
      headers: {
        'x-github-event': 'release',
        'x-hub-signature-256': 'sha256=mock-signature',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mockPayload),
    });

    const res = await webhooks.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.status).toBe('PARTIAL_SUCCESS');
    expect(body.failedDistributions).toBe(1);

    expect(mockPrisma.release.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'release-id' },
      data: expect.objectContaining({ status: 'PARTIAL_SUCCESS' })
    }));
  });
});

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockDeep } from 'jest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { createHmac } from 'crypto';

// Define mocks
const prismaMock = mockDeep<PrismaClient>();
const fetchReleaseDataMock = jest.fn();
const generateReleaseNotesMock = jest.fn();
const distributeReleaseWithResultsMock = jest.fn();
const decryptMock = jest.fn();

// Mock dependencies
jest.unstable_mockModule('../../lib/db.js', () => ({
  prisma: prismaMock,
}));

jest.unstable_mockModule('../../lib/auth.js', () => ({
  decrypt: decryptMock,
}));

jest.unstable_mockModule('../../services/github.js', () => ({
  fetchReleaseData: fetchReleaseDataMock,
}));

jest.unstable_mockModule('../../services/generator.js', () => ({
  generateReleaseNotes: generateReleaseNotesMock,
}));

jest.unstable_mockModule('../../services/distributor.js', () => ({
  distributeReleaseWithResults: distributeReleaseWithResultsMock,
}));

// Import the app after mocking dependencies
const { webhooks } = await import('../webhooks');

describe('Webhooks Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const secret = 'test_secret';
  const repoName = 'owner/repo';
  const tagName = 'v1.0.0';

  const payload = JSON.stringify({
    action: 'published',
    release: { tag_name: tagName },
    repository: { full_name: repoName },
  });

  const signature = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;

  describe('POST /github', () => {
    it('should process a release event successfully', async () => {
      // Mock DB repo find
      prismaMock.repo.findFirst.mockResolvedValue({
        id: 'repo_1',
        fullName: repoName,
        webhookSecret: secret,
        owner: 'owner',
        name: 'repo',
        user: { accessToken: 'encrypted_token' },
        config: {
            channels: [],
            emailRecipients: [],
            productName: 'Product',
            companyName: 'Company',
            customerTone: 'friendly',
        },
      } as any);

      decryptMock.mockResolvedValue('access_token');

      fetchReleaseDataMock.mockResolvedValue({
        release: {
            id: 1,
            tagName: tagName,
            name: 'Release 1.0.0',
            body: 'Release notes',
            htmlUrl: 'http://github.com/release',
            isDraft: false,
            isPrerelease: false,
            publishedAt: new Date(),
        },
        previousTag: 'v0.9.0',
        commits: [],
        pullRequests: [],
      });

      generateReleaseNotesMock.mockResolvedValue({
        customer: 'Customer notes',
        developer: 'Developer notes',
        stakeholder: 'Stakeholder notes',
        tokensUsed: 100,
        model: 'gpt-4',
      });

      // Mock DB release creation
      prismaMock.release.create.mockResolvedValue({
        id: 'release_1',
        tagName: tagName,
      } as any);

      // Mock DB notes creation
      prismaMock.generatedNotes.create.mockResolvedValue({} as any);

      distributeReleaseWithResultsMock.mockResolvedValue([
          { target: { audience: 'customer', type: 'hosted' }, success: true, responseCode: 200 }
      ]);

      prismaMock.distribution.createMany.mockResolvedValue({ count: 1 });
      prismaMock.release.update.mockResolvedValue({} as any);

      const req = new Request('http://localhost/github', {
        method: 'POST',
        headers: {
            'x-hub-signature-256': signature,
            'x-github-event': 'release',
        },
        body: payload,
      });

      const res = await webhooks.request(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual(expect.objectContaining({
          status: 'processed',
          release: tagName,
      }));

      expect(prismaMock.repo.findFirst).toHaveBeenCalledWith(expect.objectContaining({
          where: { fullName: repoName, webhookActive: true },
      }));
      expect(fetchReleaseDataMock).toHaveBeenCalled();
      expect(generateReleaseNotesMock).toHaveBeenCalled();
      expect(prismaMock.release.create).toHaveBeenCalled();
      expect(distributeReleaseWithResultsMock).toHaveBeenCalled();
      expect(prismaMock.release.update).toHaveBeenCalledWith({
          where: { id: 'release_1' },
          data: { status: 'PUBLISHED' },
      });
    });

    it('should ignore events other than release.published', async () => {
        const req = new Request('http://localhost/github', {
            method: 'POST',
            headers: {
                'x-github-event': 'push',
            },
            body: JSON.stringify({}),
        });
        const res = await webhooks.request(req);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: 'ignored', event: 'push' });
    });

    it('should return error for invalid signature', async () => {
        prismaMock.repo.findFirst.mockResolvedValue({
            webhookSecret: secret,
        } as any);

        const req = new Request('http://localhost/github', {
            method: 'POST',
            headers: {
                'x-hub-signature-256': 'sha256=invalid',
                'x-github-event': 'release',
            },
            body: payload,
        });
        const res = await webhooks.request(req);

        // Verify signature check happens after DB lookup
        expect(prismaMock.repo.findFirst).toHaveBeenCalled();
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: 'Invalid signature' });
    });

    it('should return error if repo not found', async () => {
        prismaMock.repo.findFirst.mockResolvedValue(null);

        const req = new Request('http://localhost/github', {
            method: 'POST',
            headers: {
                'x-hub-signature-256': signature,
                'x-github-event': 'release',
            },
            body: payload,
        });
        const res = await webhooks.request(req);

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: 'ignored', reason: 'repo_not_connected' });
    });
  });
});

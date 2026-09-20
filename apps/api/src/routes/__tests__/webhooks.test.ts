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
    release: { id: 1, tag_name: tagName },
    repository: { full_name: repoName },
  });

  const signature = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;

  describe('POST /github', () => {
    it('should ignore events other than release.published', async () => {
        const pushBody = JSON.stringify({});
        const pushSig = `sha256=${createHmac('sha256', 'any').update(pushBody).digest('hex')}`;
        const req = new Request('http://localhost/github', {
            method: 'POST',
            headers: {
                'x-github-event': 'push',
                'x-hub-signature-256': pushSig,
            },
            body: pushBody,
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
        expect(await res.json()).toEqual({ error: 'Unauthorized' });
    });

    it('should return 401 if repo not found', async () => {
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

        // Source returns identical error for not-found and bad-signature to prevent info leakage
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: 'Unauthorized' });
    });
  });

});

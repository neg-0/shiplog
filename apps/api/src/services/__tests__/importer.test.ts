import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockDeep } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';

// Mock DB
const mockPrisma = mockDeep<PrismaClient>();
jest.unstable_mockModule('../../lib/db.js', () => ({
  prisma: mockPrisma,
}));

// Mock GitHub
const mockListReleases = jest.fn();
const mockFetchReleaseData = jest.fn();
jest.unstable_mockModule('../github.js', () => ({
  listReleases: mockListReleases,
  fetchReleaseData: mockFetchReleaseData,
  createWebhook: jest.fn(),
  deleteWebhook: jest.fn(),
  listUserRepos: jest.fn(),
}));

// Mock Generator
const mockGenerateReleaseNotes = jest.fn();
jest.unstable_mockModule('../generator.js', () => ({
  generateReleaseNotes: mockGenerateReleaseNotes,
}));

// Suppress console output
jest.spyOn(console, 'log').mockImplementation(() => {});

// Dynamic import
const { importRepoHistory } = await import('../importer.js');

describe('importRepoHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.release.updateMany.mockResolvedValue({ count: 1 });
  });

  it('should return early if repo not found', async () => {
    mockPrisma.repo.findUnique.mockResolvedValue(null);
    await importRepoHistory('repo-1', 'token');
    expect(mockListReleases).not.toHaveBeenCalled();
  });

  it('should skip existing releases', async () => {
    mockPrisma.repo.findUnique.mockResolvedValue({
      id: 'repo-1',
      owner: 'owner',
      name: 'repo',
      fullName: 'owner/repo',
      user: { subscriptionTier: 'PRO' },
      config: { autoGenerate: true },
    } as any);

    mockListReleases.mockResolvedValue([
      { id: 100, tag_name: 'v1.0.0', name: 'R1', body: 'b', html_url: 'u', draft: false, prerelease: false, published_at: 'date', created_at: 'date' }
    ]);

    // upsert returns existing release with non-PENDING status
    mockPrisma.release.upsert.mockResolvedValue({ id: 'rel-existing', status: 'READY' } as any);

    await importRepoHistory('repo-1', 'token');

    // Should not update since it was already processed
    expect(mockPrisma.release.update).not.toHaveBeenCalled();
  });

  it('should import and generate notes for new releases when autoGenerate is true', async () => {
    mockPrisma.repo.findUnique.mockResolvedValue({
      id: 'repo-1',
      owner: 'owner',
      name: 'repo',
      fullName: 'owner/repo',
      user: { subscriptionTier: 'PRO' },
      config: { autoGenerate: true, companyName: 'Acme' },
    } as any);

    mockListReleases.mockResolvedValue([
      { id: 100, tag_name: 'v1.0.0', name: 'R1', body: 'b', html_url: 'u', draft: false, prerelease: false, published_at: 'date', created_at: 'date' }
    ]);

    // upsert returns new release with PENDING status
    mockPrisma.release.upsert.mockResolvedValue({
      id: 'rel-1',
      tagName: 'v1.0.0',
      status: 'PENDING',
    } as any);

    mockFetchReleaseData.mockResolvedValue({
      release: { tagName: 'v1.0.0' },
      previousTag: 'v0.9.0',
      commits: [],
      pullRequests: [],
    });

    mockGenerateReleaseNotes.mockResolvedValue({
      customer: 'C', developer: 'D', stakeholder: 'S', tokensUsed: 10, model: 'gpt'
    });

    await importRepoHistory('repo-1', 'token');

    // Status update to PROCESSING
    expect(mockPrisma.release.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'rel-1', status: 'PENDING', error: null }),
      data: { status: 'PROCESSING', error: expect.stringContaining(':generation:PENDING:') },
    }));

    // Status update to READY with notes
    expect(mockPrisma.release.update).toHaveBeenCalledWith({
      where: { id: 'rel-1', status: 'PROCESSING', error: expect.stringContaining(':generation:PENDING:') },
      data: {
        status: 'READY', error: null, processedAt: expect.any(Date),
        notes: { upsert: {
          create: { customer: 'C', developer: 'D', stakeholder: 'S', tokensUsed: 10, model: 'gpt' },
          update: { customer: 'C', developer: 'D', stakeholder: 'S', tokensUsed: 10, model: 'gpt' },
        } },
      },
    });
  });

  it('should skip generation if autoGenerate is false', async () => {
    mockPrisma.repo.findUnique.mockResolvedValue({
      id: 'repo-1',
      user: { subscriptionTier: 'PRO' },
      config: { autoGenerate: false },
      owner: 'owner', name: 'repo', fullName: 'owner/repo'
    } as any);

    mockListReleases.mockResolvedValue([
      { id: 100, tag_name: 'v1.0.0', name: 'R1', body: 'b', html_url: 'u', draft: false, prerelease: false, published_at: 'date', created_at: 'date' }
    ]);

    mockPrisma.release.upsert.mockResolvedValue({ id: 'rel-1', status: 'PENDING' } as any);

    await importRepoHistory('repo-1', 'token');

    expect(mockGenerateReleaseNotes).not.toHaveBeenCalled();
    expect(mockPrisma.release.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'rel-1', status: 'PENDING' }),
      data: { status: 'SKIPPED' },
    }));
  });

  it('should handle generation failure', async () => {
    mockPrisma.repo.findUnique.mockResolvedValue({
      id: 'repo-1',
      user: { subscriptionTier: 'PRO' },
      config: { autoGenerate: true },
      owner: 'owner', name: 'repo', fullName: 'owner/repo'
    } as any);

    mockListReleases.mockResolvedValue([
      { id: 100, tag_name: 'v1.0.0', name: 'R1', body: 'b', html_url: 'u', draft: false, prerelease: false, published_at: 'date', created_at: 'date' }
    ]);

    mockPrisma.release.upsert.mockResolvedValue({ id: 'rel-1', status: 'PENDING' } as any);

    // Mock failure during fetch or generation
    mockFetchReleaseData.mockRejectedValue(new Error('Fetch failed'));

    await importRepoHistory('repo-1', 'token');

    expect(mockPrisma.release.updateMany).toHaveBeenCalledWith({
      where: { id: 'rel-1', status: 'PROCESSING', error: expect.stringContaining(':generation:PENDING:') },
      data: { status: 'FAILED', error: 'Failed to generate notes. Please try again.' },
    });
  });

  it('never imports or generates notes for unpublished GitHub drafts', async () => {
    mockPrisma.repo.findUnique.mockResolvedValue({ id: 'repo-1', owner: 'owner', name: 'repo', user: { subscriptionTier: 'PRO' },
      config: { autoGenerate: true } } as any);
    mockListReleases.mockResolvedValue([{ id: 101, tag_name: 'secret-beta', draft: true, published_at: null }]);
    await importRepoHistory('repo-1', 'token');
    expect(mockPrisma.release.upsert).not.toHaveBeenCalled();
    expect(mockGenerateReleaseNotes).not.toHaveBeenCalled();
  });

  it.each([undefined, null, { autoGenerate: false }, { autoGenerate: true }])('imports metadata without provider calls when config or entitlement is absent (%s)', async config => {
    mockPrisma.repo.findUnique.mockResolvedValue({ id: 'repo-1', owner: 'owner', name: 'repo', user: { subscriptionTier: 'FREE' }, config } as any);
    mockListReleases.mockResolvedValue([{ id: 100, tag_name: 'v1.0', draft: false }]);
    mockPrisma.release.upsert.mockResolvedValue({ id: 'rel-1', status: 'PENDING', error: null, updatedAt: new Date() } as any);
    await importRepoHistory('repo-1', 'token');
    expect(mockPrisma.release.upsert).toHaveBeenCalled();
    expect(mockFetchReleaseData).not.toHaveBeenCalled();
    expect(mockGenerateReleaseNotes).not.toHaveBeenCalled();
    expect(mockPrisma.release.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'SKIPPED' } }));
  });

  it('requires explicit autoGenerate opt-in even for paid accounts', async () => {
    mockPrisma.repo.findUnique.mockResolvedValue({ id: 'repo-1', owner: 'owner', name: 'repo', user: { subscriptionTier: 'PRO' }, config: null } as any);
    mockListReleases.mockResolvedValue([{ id: 100, tag_name: 'v1.0', draft: false }]);
    mockPrisma.release.upsert.mockResolvedValue({ id: 'rel-1', status: 'PENDING', error: null, updatedAt: new Date() } as any);
    await importRepoHistory('repo-1', 'token');
    expect(mockGenerateReleaseNotes).not.toHaveBeenCalled();
  });

});

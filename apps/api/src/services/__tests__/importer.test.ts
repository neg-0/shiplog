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
  // Other exports not used in importer but might be needed if imported
  createWebhook: jest.fn(),
  deleteWebhook: jest.fn(),
  listUserRepos: jest.fn(),
}));

// Mock Generator
const mockGenerateReleaseNotes = jest.fn();
jest.unstable_mockModule('../generator.js', () => ({
  generateReleaseNotes: mockGenerateReleaseNotes,
}));

// Dynamic import
const { importRepoHistory } = await import('../importer.js');

describe('importRepoHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      config: { autoGenerate: true },
    } as any);

    mockListReleases.mockResolvedValue([
      { id: 100, tag_name: 'v1.0.0', name: 'R1', body: 'b', html_url: 'u', draft: false, prerelease: false, published_at: 'date', created_at: 'date' }
    ]);

    mockPrisma.release.findUnique.mockResolvedValue({ id: 'rel-existing' } as any);

    await importRepoHistory('repo-1', 'token');

    expect(mockPrisma.release.create).not.toHaveBeenCalled();
  });

  it('should import and generate notes for new releases when autoGenerate is true', async () => {
    mockPrisma.repo.findUnique.mockResolvedValue({
      id: 'repo-1',
      owner: 'owner',
      name: 'repo',
      fullName: 'owner/repo',
      config: { autoGenerate: true, companyName: 'Acme' },
    } as any);

    mockListReleases.mockResolvedValue([
      { id: 100, tag_name: 'v1.0.0', name: 'R1', body: 'b', html_url: 'u', draft: false, prerelease: false, published_at: 'date', created_at: 'date' }
    ]);

    mockPrisma.release.findUnique.mockResolvedValue(null);

    mockPrisma.release.create.mockResolvedValue({
      id: 'rel-1',
      tagName: 'v1.0.0',
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

    expect(mockPrisma.release.create).toHaveBeenCalled();
    // Status update to PROCESSING
    expect(mockPrisma.release.update).toHaveBeenCalledWith({
      where: { id: 'rel-1' },
      data: { status: 'PROCESSING' },
    });

    // Status update to READY with notes
    expect(mockPrisma.release.update).toHaveBeenCalledWith({
      where: { id: 'rel-1' },
      data: {
        status: 'READY',
        notes: {
          create: {
            customer: 'C', developer: 'D', stakeholder: 'S', tokensUsed: 10, model: 'gpt',
          },
        },
      },
    });
  });

  it('should skip generation if autoGenerate is false', async () => {
    mockPrisma.repo.findUnique.mockResolvedValue({
      id: 'repo-1',
      config: { autoGenerate: false },
      owner: 'owner', name: 'repo', fullName: 'owner/repo'
    } as any);

    mockListReleases.mockResolvedValue([
      { id: 100, tag_name: 'v1.0.0', name: 'R1', body: 'b', html_url: 'u', draft: false, prerelease: false, published_at: 'date', created_at: 'date' }
    ]);

    mockPrisma.release.findUnique.mockResolvedValue(null);
    mockPrisma.release.create.mockResolvedValue({ id: 'rel-1' } as any);

    await importRepoHistory('repo-1', 'token');

    expect(mockGenerateReleaseNotes).not.toHaveBeenCalled();
    expect(mockPrisma.release.update).toHaveBeenCalledWith({
      where: { id: 'rel-1' },
      data: { status: 'SKIPPED' },
    });
  });

  it('should handle generation failure', async () => {
    mockPrisma.repo.findUnique.mockResolvedValue({
      id: 'repo-1',
      config: { autoGenerate: true },
      owner: 'owner', name: 'repo', fullName: 'owner/repo'
    } as any);

    mockListReleases.mockResolvedValue([
      { id: 100, tag_name: 'v1.0.0', name: 'R1', body: 'b', html_url: 'u', draft: false, prerelease: false, published_at: 'date', created_at: 'date' }
    ]);

    mockPrisma.release.findUnique.mockResolvedValue(null);
    mockPrisma.release.create.mockResolvedValue({ id: 'rel-1' } as any);

    // Mock failure during fetch or generation
    mockFetchReleaseData.mockRejectedValue(new Error('Fetch failed'));

    await importRepoHistory('repo-1', 'token');

    expect(mockPrisma.release.update).toHaveBeenCalledWith({
      where: { id: 'rel-1' },
      data: { status: 'FAILED' },
    });
  });
});

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { fetchReleaseData, listReleases, createWebhook, deleteWebhook, listUserRepos } from '../github.js';

describe('github service', () => {
  const mockFetch = jest.fn() as jest.Mock;
  global.fetch = mockFetch;

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('fetchReleaseData', () => {
    it('should fetch release data successfully with previous tag and PRs', async () => {
      // 1. Get release
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 1,
          tag_name: 'v1.0.0',
          name: 'Release v1.0.0',
          body: 'Body',
          html_url: 'url',
          draft: false,
          prerelease: false,
          published_at: '2023-01-01T00:00:00Z',
        }),
      });

      // 2. Get releases (to find previous tag)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ([
          { tag_name: 'v1.0.0' },
          { tag_name: 'v0.9.0' },
        ]),
      });

      // 3. Get compare
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          commits: [
            {
              sha: 'sha1',
              commit: { message: 'feat: something (#1)', author: { name: 'Dev' } },
              author: { login: 'dev-user' }
            },
          ],
        }),
      });

      // 4. Get PR #1
      mockFetch.mockResolvedValueOnce({
         ok: true,
         json: async () => ({
           number: 1,
           title: 'PR 1',
           body: 'PR Body',
           user: { login: 'dev1' },
           labels: [{ name: 'feat' }],
         }),
      });

      const data = await fetchReleaseData('owner', 'repo', 'v1.0.0', 'token');

      expect(data.release.tagName).toBe('v1.0.0');
      expect(data.previousTag).toBe('v0.9.0');
      expect(data.commits).toHaveLength(1);
      expect(data.commits[0].author).toBe('dev-user');
      expect(data.pullRequests).toHaveLength(1);
      expect(data.pullRequests[0].number).toBe(1);
    });

    it('should handle missing previous tag', async () => {
      // 1. Get release
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 1, tag_name: 'v1.0.0' }),
      });

      // 2. Get releases (only one release)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ([
          { tag_name: 'v1.0.0' },
        ]),
      });

      const data = await fetchReleaseData('owner', 'repo', 'v1.0.0', 'token');

      expect(data.previousTag).toBeNull();
      expect(data.commits).toHaveLength(0); // No compare call if no previous tag
    });

    it('should throw error if release not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await expect(fetchReleaseData('owner', 'repo', 'v1.0.0', 'token'))
        .rejects.toThrow('Failed to fetch release: 404');
    });
  });

  describe('listReleases', () => {
    it('should return releases', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ([{ id: 1, tag_name: 'v1.0.0' }]),
      });

      const releases = await listReleases('owner', 'repo', 'token');
      expect(releases).toHaveLength(1);
      expect(releases[0].tag_name).toBe('v1.0.0');
    });

    it('should throw error on failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(listReleases('owner', 'repo', 'token'))
        .rejects.toThrow('Failed to list releases: 500');
    });
  });

  describe('createWebhook', () => {
    it('should create webhook', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 123 }),
      });

      const result = await createWebhook('owner', 'repo', 'url', 'secret', 'token');
      expect(result.id).toBe(123);
    });

    it('should throw error on failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      });

      await expect(createWebhook('owner', 'repo', 'url', 'secret', 'token'))
        .rejects.toThrow('Failed to create webhook: 400 Bad Request');
    });
  });

  describe('deleteWebhook', () => {
     it('should delete webhook', async () => {
       mockFetch.mockResolvedValue({
         ok: true,
       });
       await deleteWebhook('owner', 'repo', 123, 'token');
       expect(mockFetch).toHaveBeenCalledWith(
         expect.stringContaining('/hooks/123'),
         expect.objectContaining({ method: 'DELETE' })
       );
     });
  });

  describe('listUserRepos', () => {
    it('should list repos', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ([
          { id: 1, name: 'repo1', full_name: 'owner/repo1', owner: { login: 'owner' }, description: 'desc' }
        ]),
        headers: new Headers(),
      });

      const repos = await listUserRepos('token');
      expect(repos).toHaveLength(1);
      expect(repos[0].name).toBe('repo1');
    });
  });
});

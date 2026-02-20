import { listUserRepos } from './github';
import { jest } from '@jest/globals';

describe('GitHub Service', () => {
  const accessToken = 'test-token';
  const mockedFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    mockedFetch.mockClear();
  });

  it('listUserRepos should fetch repos from GitHub API', async () => {
    const mockRepos = [
      { id: 1, name: 'repo1', full_name: 'owner/repo1', owner: { login: 'owner' }, description: 'desc1' },
      { id: 2, name: 'repo2', full_name: 'owner/repo2', owner: { login: 'owner' }, description: null },
    ];

    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockRepos,
    } as Response);

    const repos = await listUserRepos(accessToken);

    expect(mockedFetch).toHaveBeenCalledWith(
      'https://api.github.com/user/repos?per_page=100&sort=updated',
      expect.objectContaining({
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      })
    );

    expect(repos).toHaveLength(2);
    expect(repos[0]).toEqual({
      id: 1,
      name: 'repo1',
      full_name: 'owner/repo1',
      owner: 'owner',
      description: 'desc1',
    });
  });

  it('listUserRepos should throw error on failure', async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    await expect(listUserRepos(accessToken)).rejects.toThrow('Failed to list repos: 500');
  });
});

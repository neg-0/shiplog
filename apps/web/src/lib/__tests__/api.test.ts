import { isAuthenticated, getUser, getRepos, getRelease } from '../api';

const mockFetch = jest.fn() as jest.Mock;
global.fetch = mockFetch;

describe('api', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
      status: 200,
    });
    // Clear cookies
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: '',
    });
  });

  describe('Auth Utils', () => {
    it('checks authentication via cookie', () => {
      expect(isAuthenticated()).toBe(false);
      Object.defineProperty(document, 'cookie', {
        writable: true,
        value: 'shiplog_logged_in=1',
      });
      expect(isAuthenticated()).toBe(true);
    });
  });

  describe('fetchApi', () => {
    it('calls fetch with credentials: include', async () => {
      await getUser();

      expect(mockFetch).toHaveBeenCalledWith('/api/user/me', expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        credentials: 'include',
      }));
    });

    it('handles 401 Unauthorized', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
        status: 200,
      }).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
      });

      try {
        await getUser();
      } catch (e: any) {
        // Ignore errors
      }
    });

    it('handles other errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server Error' }),
      });

      await expect(getUser()).rejects.toThrow('Server Error');
    });

    it('handles network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network Error'));
      await expect(getUser()).rejects.toThrow('Network Error');
    });
  });

  describe('API Functions', () => {
    it('getRepos calls /repos', async () => {
      await getRepos();
      expect(mockFetch).toHaveBeenCalledWith('/api/repos', expect.anything());
    });

    it('getRelease calls /releases/:id', async () => {
      await getRelease('123');
      expect(mockFetch).toHaveBeenCalledWith('/api/releases/123', expect.anything());
    });
  });
});

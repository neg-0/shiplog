import { setToken, clearToken, isAuthenticated, getUser, getRepos, getRelease } from '../api';

const mockFetch = jest.fn() as jest.Mock;
global.fetch = mockFetch;

describe('api', () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetch.mockClear();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
      status: 200,
    });
    // Reset location if possible, or assume it's stable
    // window.history.pushState({}, '', '/');
  });

  describe('Auth Utils', () => {
    it('sets token in localStorage', () => {
      expect(localStorage.getItem('shiplog_token')).toBeNull();
      setToken('test-token');
      expect(localStorage.getItem('shiplog_token')).toBe('test-token');
    });

    it('clears token from localStorage', () => {
      setToken('test-token');
      clearToken();
      expect(localStorage.getItem('shiplog_token')).toBeNull();
    });

    it('checks authentication', () => {
      expect(isAuthenticated()).toBe(false);
      setToken('test-token');
      expect(isAuthenticated()).toBe(true);
    });
  });

  describe('fetchApi', () => {
    it('calls fetch with correct headers and token', async () => {
      setToken('test-token');
      await getUser();

      expect(mockFetch).toHaveBeenCalledWith('/api/user/me', expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        }),
      }));
    });

    it('calls fetch without token if not set', async () => {
      await getUser();

      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1].headers;

      expect(headers).toHaveProperty('Content-Type', 'application/json');
      expect(headers).not.toHaveProperty('Authorization');
    });

    it('handles 401 Unauthorized', async () => {
      // Mock console.error to avoid noise if JSDOM logs navigation error
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
      });

      setToken('test-token');

      try {
        await getUser();
      } catch (e: any) {
        // Ignore errors (could be Unauthorized or JSDOM navigation error)
      }

      expect(localStorage.getItem('shiplog_token')).toBeNull(); // Should clear token

      consoleError.mockRestore();
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

import { getUser } from './api';

describe('API Client', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
  });

  it('should fetch user', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: '1', name: 'Test User' }),
    });

    // Mock localStorage
    const localStorageMock = (function() {
      let store: Record<string, string> = {};
      return {
        getItem: function(key: string) {
          return store[key] || null;
        },
        setItem: function(key: string, value: string) {
          store[key] = value.toString();
        },
        clear: function() {
          store = {};
        },
        removeItem: function(key: string) {
          delete store[key];
        }
      };
    })();
    Object.defineProperty(window, 'localStorage', { value: localStorageMock });

    localStorage.setItem('shiplog_token', 'test-token');

    const user = await getUser();
    expect(user).toEqual({ id: '1', name: 'Test User' });
    expect(global.fetch).toHaveBeenCalledWith('/api/user/me', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer test-token'
      })
    }));
  });
});

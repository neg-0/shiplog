import { jest } from '@jest/globals';

// Mock global fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({}),
    ok: true,
    status: 200,
    text: () => Promise.resolve(''),
    headers: new Headers(),
  } as Response)
);

// Mock process.env variables commonly used
process.env.APP_URL = 'http://test.local';
process.env.API_URL = 'http://api.test.local';
process.env.GITHUB_CLIENT_ID = 'test-client-id';
process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';

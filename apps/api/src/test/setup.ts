import { jest } from '@jest/globals';

// Mock global fetch
global.fetch = jest.fn((...args) =>
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

// Mock console methods to keep test output clean
global.console.log = jest.fn();
global.console.warn = jest.fn();
global.console.error = jest.fn();

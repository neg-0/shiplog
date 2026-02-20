import { jest } from '@jest/globals';

// Mock Stripe
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: {
      create: jest.fn(),
      list: jest.fn(() => ({ data: [] })),
    },
    checkout: {
      sessions: {
        create: jest.fn(),
      },
    },
  }));
});

// Mock OpenAI
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn(() => ({
          choices: [{ message: { content: 'Mocked AI response' } }],
          usage: { total_tokens: 100 },
        })),
      },
    },
  }));
});

// Mock fetch globally
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  })
) as jest.Mock;

// Mock process.env
process.env.APP_URL = 'http://localhost:3000';
process.env.API_URL = 'http://localhost:3001';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.GITHUB_CLIENT_ID = 'mock-client-id';
process.env.GITHUB_CLIENT_SECRET = 'mock-client-secret';

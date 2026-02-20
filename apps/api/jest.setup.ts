import { jest } from '@jest/globals';

jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        updateMany: jest.fn(),
      },
      $connect: jest.fn(),
      $disconnect: jest.fn(),
    })),
  };
});

jest.mock('stripe', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      customers: {
        create: jest.fn(),
        retrieve: jest.fn(),
        list: jest.fn().mockImplementation(() => Promise.resolve({ data: [] })),
      },
      checkout: {
        sessions: {
          create: jest.fn().mockImplementation(() => Promise.resolve({ url: 'http://mock-stripe-url.com' })),
        },
      },
      billingPortal: {
        sessions: {
          create: jest.fn().mockImplementation(() => Promise.resolve({ url: 'http://mock-portal-url.com' })),
        },
      },
      webhooks: {
        constructEvent: jest.fn(),
      },
      subscriptions: {
        retrieve: jest.fn(),
      },
    })),
  };
});

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockImplementation(() => Promise.resolve({
             choices: [{ message: { content: 'Mocked content' } }],
             usage: { total_tokens: 10 },
             model: 'mock-model'
          })),
        },
      },
    })),
  };
});

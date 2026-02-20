import { jest, beforeEach } from '@jest/globals';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';

// Mock the prisma export
jest.mock('../lib/db.js', () => ({
  __esModule: true,
  prisma: mockDeep<PrismaClient>(),
}));

import { prisma } from '../lib/db.js';

export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

// Global fetch mock
global.fetch = jest.fn();

// Mock setInterval to prevent background tasks from hanging tests
global.setInterval = jest.fn() as any;

beforeEach(() => {
  jest.clearAllMocks();
});

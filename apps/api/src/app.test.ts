import { jest } from '@jest/globals';
import { mockDeep } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';

// Mock Prisma before importing app
jest.mock('./lib/db', () => ({
  __esModule: true,
  prisma: mockDeep<PrismaClient>(),
}));

import { app } from './app.js';

describe('API Versioning', () => {

  it('should support /v1/health', async () => {
    const res = await app.request('/v1/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status', 'healthy');
  });

  it('should support legacy /health with deprecation warning', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('Warning')).toContain('deprecated');
    const body = await res.json();
    expect(body).toHaveProperty('status', 'healthy');
  });

  it('should support /health with X-API-Version: 1 without warning', async () => {
    const res = await app.request('/health', {
      headers: {
        'X-API-Version': '1',
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Warning')).toBeNull();
    const body = await res.json();
    expect(body).toHaveProperty('status', 'healthy');
  });

  it('should reject unsupported version', async () => {
    const res = await app.request('/health', {
      headers: {
        'X-API-Version': '99',
      },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unsupported API version' });
  });

  it('should skip warning for root /', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('Warning')).toBeNull();
  });
});

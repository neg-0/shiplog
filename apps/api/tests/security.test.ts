import { jest, describe, it, expect } from '@jest/globals';

// Mock Prisma
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
  },
  repo: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
  },
  release: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
  },
  generatedNotes: {
    create: jest.fn(),
  },
  distribution: {
    createMany: jest.fn(),
  },
  $transaction: jest.fn((callback: any) => callback(mockPrisma)),
};

jest.unstable_mockModule('../src/lib/db.js', () => ({
  prisma: mockPrisma,
}));

// Import app after mocking
const { default: app } = await import('../src/app.js');

describe('Security Headers', () => {
  it('should include security headers', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains; preload');
    expect(res.headers.get('Content-Security-Policy')).toBe("default-src 'self'");
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('should include CORS headers for allowed origin', async () => {
    // Mock environment variable for APP_URL if needed, but setup.ts handles it
    const res = await app.request('/', {
      headers: {
        Origin: 'http://localhost:3000',
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('should include CORS headers for OPTIONS request', async () => {
    const res = await app.request('/', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
  });
});

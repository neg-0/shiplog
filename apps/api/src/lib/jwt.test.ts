import { jest, describe, it, expect, beforeAll } from '@jest/globals';

// Set JWT_SECRET before importing the module
process.env.JWT_SECRET = 'test-secret-key-for-jwt-testing';

const { signToken, verifyToken } = await import('./jwt.js');

describe('JWT utilities', () => {
  describe('signToken', () => {
    it('should produce a non-empty string', async () => {
      const token = await signToken('user-1');
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('should produce a token with three dot-separated parts', async () => {
      const token = await signToken('user-1');
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });
  });

  describe('verifyToken', () => {
    it('should roundtrip: sign then verify returns the userId', async () => {
      const token = await signToken('user-42');
      const result = await verifyToken(token);
      expect(result).not.toBeNull();
      expect(result!.userId).toBe('user-42');
      expect(result!.iat).toBeDefined();
    });

    it('should return null for an invalid token', async () => {
      const result = await verifyToken('not-a-real-token');
      expect(result).toBeNull();
    });

    it('should return null for a tampered token', async () => {
      const token = await signToken('user-1');
      const tampered = token.slice(0, -4) + 'XXXX';
      const result = await verifyToken(tampered);
      expect(result).toBeNull();
    });

    it('should return null for an empty string', async () => {
      const result = await verifyToken('');
      expect(result).toBeNull();
    });
  });

  describe('missing JWT_SECRET', () => {
    it('should throw when JWT_SECRET is not set', async () => {
      const original = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      try {
        await expect(signToken('user-1')).rejects.toThrow('JWT_SECRET is not set');
      } finally {
        process.env.JWT_SECRET = original;
      }
    });
  });
});

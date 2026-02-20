import { Context, Next } from 'hono';

export const requireAuth = jest.fn(async (c: Context, next: Next) => {
  c.set('user', {
    id: 'test-user-id',
    githubId: 12345,
    login: 'testuser',
    email: 'test@example.com',
  });
  await next();
});

export const optionalAuth = jest.fn(async (c: Context, next: Next) => {
  await next();
});

export const encrypt = jest.fn().mockResolvedValue('encrypted-token');
export const decrypt = jest.fn().mockResolvedValue('decrypted-token');

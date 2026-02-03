/**
 * Auth middleware for protected routes
 */

import type { Context, Next } from 'hono';
import { verifyToken } from './jwt';
import { prisma } from './db';

// Extend Hono context with user
declare module 'hono' {
  interface ContextVariableMap {
    user: {
      id: string;
      githubId: number;
      login: string;
      email: string | null;
    };
  }
}

/**
 * Middleware that requires a valid JWT token
 * Sets c.get('user') with user data from database
 */
export async function requireAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token);

  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  // Fetch user from database
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      githubId: true,
      login: true,
      email: true,
    },
  });

  if (!user) {
    return c.json({ error: 'User not found' }, 401);
  }

  // Attach user to context
  c.set('user', user);

  await next();
}

/**
 * Optional auth - doesn't fail if no token, but sets user if valid
 */
export async function optionalAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = await verifyToken(token);

    if (payload) {
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          githubId: true,
          login: true,
          email: true,
        },
      });

      if (user) {
        c.set('user', user);
      }
    }
  }

  await next();
}

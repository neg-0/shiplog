/**
 * Auth middleware and token encryption utilities
 */

import type { Context, Next } from 'hono';
import { verifyToken } from './jwt.js';
import { prisma } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET;

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

// ============================================
// ENCRYPTION UTILITIES
// ============================================

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');

  // Buffer is a Uint8Array but its .buffer is typed as ArrayBufferLike.
  // Normalize to a plain ArrayBuffer-backed Uint8Array for WebCrypto BufferSource types.
  const buf = Buffer.from(padded, 'base64');
  return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

async function deriveAesKey(): Promise<CryptoKey> {
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not set');

  // Derive a stable 256-bit key from JWT_SECRET
  const secretBytes = new TextEncoder().encode(JWT_SECRET);
  const hash = await crypto.subtle.digest('SHA-256', secretBytes);
  return await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * Encrypt a string (e.g., access token) using AES-GCM
 * Returns: v1.<iv>.<ciphertext>
 */
export async function encrypt(plaintext: string): Promise<string> {
  const key = await deriveAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintextBytes));

  return `v1.${base64UrlEncode(iv)}.${base64UrlEncode(ciphertext)}`;
}

/**
 * Decrypt a string that was encrypted with encrypt()
 */
export async function decrypt(encrypted: string): Promise<string> {
  if (!encrypted.startsWith('v1.')) {
    throw new Error('Invalid encrypted format');
  }

  const parts = encrypted.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }

  const [, ivStr, ciphertextStr] = parts;
  const iv = base64UrlDecode(ivStr) as Uint8Array<ArrayBuffer>;
  const ciphertext = base64UrlDecode(ciphertextStr) as Uint8Array<ArrayBuffer>;

  const key = await deriveAesKey();
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);

  return new TextDecoder().decode(decrypted);
}

// ============================================
// AUTH MIDDLEWARE
// ============================================

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

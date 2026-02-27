/**
 * Authentication middleware and encryption utilities.
 *
 * @module auth
 * @description Provides middleware for JWT verification and utilities for encrypting/decrypting sensitive data (like tokens).
 */

import type { Context, Next } from 'hono';
import { verifyToken } from './jwt.js';
import { prisma } from './db.js';
import { setLoggerContext } from './logger.js';

// Extend Hono context with user
declare module 'hono' {
  interface ContextVariableMap {
    user: {
      id: string;
      githubId: number;
      login: string;
      email: string | null;
      lastLogoutAt: Date | null;
    };
  }
}

// ============================================
// ENCRYPTION UTILITIES
// ============================================

/**
 * Encode bytes to Base64URL string.
 * @param bytes - Data to encode.
 * @returns Base64URL string.
 */
function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/**
 * Decode Base64URL string to bytes.
 * @param str - Base64URL string.
 * @returns Decoded bytes.
 */
function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');

  const buf = Buffer.from(padded, 'base64');
  return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

/**
 * Derive an AES-GCM key from the JWT_SECRET.
 * @returns CryptoKey for AES-GCM.
 * @throws Error if JWT_SECRET is not set.
 */
async function deriveAesKey(): Promise<CryptoKey> {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');

  const secretBytes = new TextEncoder().encode(secret);
  const salt = new TextEncoder().encode('shiplog-secure-salt-v1');

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a string using AES-GCM.
 * Format: `v1.<iv_base64>.<ciphertext_base64>`
 */
export async function encrypt(plaintext: string): Promise<string> {
  const key = await deriveAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintextBytes));

  return `v1.${base64UrlEncode(iv)}.${base64UrlEncode(ciphertext)}`;
}

/**
 * Decrypt a string encrypted by `encrypt()`.
 */
export async function decrypt(encrypted: string): Promise<string> {
  if (!encrypted.startsWith('v1.')) {
    throw new Error('Invalid encrypted format');
  }

  const parts = encrypted.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }

  const ivStr = parts[1];
  const ciphertextStr = parts[2];

  if (!ivStr || !ciphertextStr) {
    throw new Error('Invalid encrypted format');
  }

  const iv = base64UrlDecode(ivStr);
  const ciphertext = base64UrlDecode(ciphertextStr);

  const key = await deriveAesKey();
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as any }, key, ciphertext as any);

  return new TextDecoder().decode(decrypted);
}

// ============================================
// AUTH MIDDLEWARE
// ============================================

/**
 * Extract session token from httpOnly cookie or Authorization header.
 * Prefers cookie-based auth; falls back to Bearer token for API clients.
 */
function getSessionToken(c: Context): string | null {
  const cookieHeader = c.req.header('Cookie');
  if (cookieHeader) {
    const match = cookieHeader.match(/shiplog_session=([^;]+)/);
    if (match) return match[1];
  }

  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

/**
 * Middleware to enforce authentication.
 * Verifies session token from cookie or Authorization header.
 * Checks token revocation via lastLogoutAt.
 */
export async function requireAuth(c: Context, next: Next) {
  const token = getSessionToken(c);

  if (!token) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const payload = await verifyToken(token);

  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      githubId: true,
      login: true,
      email: true,
      lastLogoutAt: true,
    },
  });

  if (!user) {
    return c.json({ error: 'User not found' }, 401);
  }

  // Check revocation
  if (user.lastLogoutAt && payload.iat) {
    const logoutTime = Math.floor(user.lastLogoutAt.getTime() / 1000);
    if (payload.iat < logoutTime) {
      return c.json({ error: 'Token revoked' }, 401);
    }
  }

  c.set('user', user);
  setLoggerContext({ userId: user.id });

  return next();
}

/**
 * Middleware for optional authentication.
 * Checks for a session token. If present and valid, attaches the user to context.
 */
export async function optionalAuth(c: Context, next: Next) {
  const token = getSessionToken(c);

  if (token) {
    const payload = await verifyToken(token);

    if (payload) {
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          githubId: true,
          login: true,
          email: true,
          lastLogoutAt: true,
        },
      });

      if (user) {
        let valid = true;
        if (user.lastLogoutAt && payload.iat) {
          const logoutTime = Math.floor(user.lastLogoutAt.getTime() / 1000);
          if (payload.iat < logoutTime) {
            valid = false;
          }
        }

        if (valid) {
          c.set('user', user);
          setLoggerContext({ userId: user.id });
        }
      }
    }
  }

  await next();
}

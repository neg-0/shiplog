/**
 * JWT utilities for signing and verifying tokens.
 *
 * @module jwt
 * @description Provides helper functions to sign and verify JSON Web Tokens using `jose`.
 */

import { SignJWT, jwtVerify } from 'jose';

/**
 * Get the JWT secret key as Uint8Array.
 * @returns Secret key bytes.
 * @throws Error if JWT_SECRET is not set.
 */
function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return new TextEncoder().encode(secret);
}

/**
 * Sign a new JWT for a user.
 * @param userId - The user ID to include in the payload.
 * @returns Signed JWT string.
 */
export async function signToken(userId: string): Promise<string> {
  return await new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secretKey());
}

/**
 * Verify a JWT and extract the user ID.
 * @param token - The JWT string to verify.
 * @returns Object with userId if valid, or null if invalid.
 */
export async function verifyToken(token: string): Promise<{ userId: string; iat?: number } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    if (typeof payload.userId !== 'string') return null;
    return { userId: payload.userId, iat: payload.iat };
  } catch {
    return null;
  }
}

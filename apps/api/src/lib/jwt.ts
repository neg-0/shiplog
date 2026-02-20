import { SignJWT, jwtVerify } from 'jose';

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return new TextEncoder().encode(secret);
}

export async function signToken(userId: string): Promise<string> {
  return await new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secretKey());
}

export async function verifyToken(token: string): Promise<{ userId: string; iat?: number } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    if (typeof payload.userId !== 'string') return null;
    return { userId: payload.userId, iat: payload.iat };
  } catch {
    return null;
  }
}

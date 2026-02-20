/**
 * Database client initialization.
 *
 * @module db
 * @description Exports a singleton instance of PrismaClient.
 */

import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * Singleton PrismaClient instance.
 * @description Prevents multiple connections during hot-reloading in development.
 */
export const prisma = globalThis.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

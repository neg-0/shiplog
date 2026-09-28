import type { Prisma } from '@prisma/client';

/** Personal repositories belong to their connector; organization access follows membership. */
export const readableRepo = (userId: string): Prisma.RepoWhereInput => ({
  OR: [
    { userId, organizationId: null },
    { organization: { ownerId: userId } },
    { organization: { members: { some: { userId } } } },
  ],
});

/** Members may read, but only organization owners/admins may change or publish. */
export const writableRepo = (userId: string): Prisma.RepoWhereInput => ({
  OR: [
    { userId, organizationId: null },
    { organization: { ownerId: userId } },
    { organization: { members: { some: { userId, role: { in: ['OWNER', 'ADMIN'] } } } } },
  ],
});

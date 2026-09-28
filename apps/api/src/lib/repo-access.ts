import type { OrgRole, Prisma } from '@prisma/client';
import { prisma } from './db.js';

type TeamOrganization = {
  subscriptionId: string | null;
  owner: {
    subscriptionTier: string;
    subscriptionStatus: string | null;
    stripeSubscriptionId: string | null;
  };
};
type MembershipClient = Pick<Prisma.TransactionClient, 'organizationMember'>;

/** An organization only lends access while its owner's linked Team plan is usable. */
export const hasActiveTeamSubscription = (organization: TeamOrganization): boolean =>
  organization.owner.subscriptionTier === 'TEAM' &&
  ['active', 'trialing'].includes(organization.owner.subscriptionStatus ?? '') &&
  Boolean(organization.subscriptionId) &&
  organization.subscriptionId === organization.owner.stripeSubscriptionId;

const memberOrganizations = async (userId: string, roles?: OrgRole[], client: MembershipClient = prisma): Promise<Array<{ id: string; subscriptionId: string }>> => {
  const memberships = await client.organizationMember.findMany({
    where: { userId, ...(roles ? { role: { in: roles } } : {}) },
    select: {
      organization: {
        select: {
          id: true,
          subscriptionId: true,
          owner: {
            select: {
              subscriptionTier: true,
              subscriptionStatus: true,
              stripeSubscriptionId: true,
            },
          },
        },
      },
    },
  });

  return (memberships ?? [])
    .filter(({ organization }) => hasActiveTeamSubscription(organization))
    .map(({ organization }) => ({ id: organization.id, subscriptionId: organization.subscriptionId! }));
};

const repoAccess = async (userId: string, roles?: OrgRole[], client: MembershipClient = prisma): Promise<Prisma.RepoWhereInput> => {
  const organizations = await memberOrganizations(userId, roles, client);
  return {
    OR: [
      { userId, organizationId: null },
      // The owner keeps access after a Team plan ends so they can clean up.
      { organization: { ownerId: userId } },
      ...organizations.map(({ id, subscriptionId }): Prisma.RepoWhereInput => ({
        organizationId: id,
        organization: {
          // Re-check mutable billing state and membership in the repository query.
          subscriptionId,
          owner: {
            subscriptionTier: 'TEAM',
            subscriptionStatus: { in: ['active', 'trialing'] },
            stripeSubscriptionId: subscriptionId,
          },
          members: {
            some: { userId, ...(roles ? { role: { in: roles } } : {}) },
          },
        },
      })),
    ],
  };
};

/** Personal repositories belong to their connector; Team repositories follow paid membership. */
export const readableRepo = (userId: string, client?: MembershipClient): Promise<Prisma.RepoWhereInput> => repoAccess(userId, undefined, client);

/** Members may read, but only organization owners/admins may change or publish. */
export const writableRepo = (userId: string, client?: MembershipClient): Promise<Prisma.RepoWhereInput> =>
  repoAccess(userId, ['OWNER', 'ADMIN'], client);

import type { SubscriptionTier } from '@prisma/client';

type EntitledRepo = {
  id: string;
  user?: { subscriptionTier: SubscriptionTier } | null;
};

// Explicit deployment configuration preserves pre-existing automation without
// granting paid features to every Free account or silently changing its plan.
export function repoEntitlements(repo: EntitledRepo) {
  const tier = repo.user?.subscriptionTier ?? 'FREE';
  const grandfathered = (process.env.GRANDFATHERED_REPO_IDS ?? '')
    .split(',').map(id => id.trim()).filter(Boolean).includes(repo.id);
  return {
    automation: tier === 'PRO' || tier === 'TEAM' || grandfathered,
    channels: tier === 'PRO' || tier === 'TEAM' || grandfathered,
    branding: tier === 'TEAM',
    grandfathered,
  };
}

export function canUsePaidFeatures(repo: EntitledRepo): boolean {
  return repoEntitlements(repo).automation;
}

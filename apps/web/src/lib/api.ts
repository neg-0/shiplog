/**
 * API client for ShipLog
 */

const getToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('shiplog_token');
};

export const setToken = (token: string) => {
  localStorage.setItem('shiplog_token', token);
};

export const clearToken = () => {
  localStorage.removeItem('shiplog_token');
};

export const isAuthenticated = (): boolean => {
  return !!getToken();
};

async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    const err = new Error(error.error || error.message || 'Request failed');
    (err as Error & { status?: number; data?: unknown }).status = res.status;
    (err as Error & { status?: number; data?: unknown }).data = error;
    throw err;
  }

  return res.json();
}

// ============================================
// USER
// ============================================

export type SubscriptionTier = 'FREE' | 'PRO' | 'TEAM';

export interface User {
  id: string;
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  repoCount: number;
}

export async function getUser(): Promise<User> {
  return fetchApi('/user/me');
}

export async function updateUser(data: { name?: string }): Promise<{ success: true }> {
  return fetchApi('/user/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteUser(): Promise<{ success: true }> {
  return fetchApi('/user/me', {
    method: 'DELETE',
  });
}

// ============================================
// BILLING
// ============================================

export async function createCheckoutSession(plan: 'pro' | 'team'): Promise<{ url: string | null }> {
  return fetchApi(`/billing/checkout?plan=${plan}`, {
    method: 'POST',
  });
}

export async function createPortalSession(): Promise<{ url: string }> {
  return fetchApi('/billing/portal', {
    method: 'POST',
  });
}

export async function getBillingStatus(): Promise<{
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
}> {
  return fetchApi('/billing/status');
}

// ============================================
// REPOS
// ============================================

export interface Repo {
  id: string;
  githubId: number;
  name: string;
  fullName: string;
  description: string | null;
  status: 'PENDING' | 'ACTIVE' | 'PAUSED' | 'ERROR';
  lastRelease: string | null;
  lastReleaseDate: string | null;
}

export interface Channel {
  id: string;
  type: 'SLACK' | 'DISCORD' | 'WEBHOOK';
  name: string;
  webhookUrl: string;
  audience: 'CUSTOMER' | 'DEVELOPER' | 'STAKEHOLDER';
  enabled: boolean;
}

export interface RepoDetail extends Repo {
  owner: string;
  webhookActive: boolean;
  config: {
    autoGenerate: boolean;
    autoPublish: boolean;
    generateCustomer: boolean;
    generateDeveloper: boolean;
    generateStakeholder: boolean;
    customerTone: string | null;
    companyName: string | null;
    productName: string | null;
    channels?: Channel[];
  } | null;
  releases: Array<{
    id: string;
    tagName: string;
    name: string | null;
    publishedAt: string | null;
    status: string;
  }>;
}

export interface GitHubRepo {
  githubId: number;
  name: string;
  fullName: string;
  owner: string;
  description: string | null;
}

export async function getRepos(): Promise<{ repos: Repo[] }> {
  return fetchApi('/repos');
}

export async function getRepo(id: string): Promise<RepoDetail> {
  return fetchApi(`/repos/${id}`);
}

export async function getAvailableRepos(): Promise<{ repos: GitHubRepo[] }> {
  return fetchApi('/repos/github/available');
}

export async function connectRepo(repo: GitHubRepo): Promise<{ status: string; id: string; fullName: string }> {
  return fetchApi('/repos/connect', {
    method: 'POST',
    body: JSON.stringify({
      githubId: repo.githubId,
      owner: repo.owner,
      repo: repo.name,
      fullName: repo.fullName,
      description: repo.description,
    }),
  });
}

export async function disconnectRepo(id: string): Promise<{ status: string }> {
  return fetchApi(`/repos/${id}`, {
    method: 'DELETE',
  });
}

export async function updateRepoConfig(id: string, config: Partial<RepoDetail['config']>): Promise<void> {
  return fetchApi(`/repos/${id}/config`, {
    method: 'PATCH',
    body: JSON.stringify(config),
  });
}

export async function addChannel(
  repoId: string,
  channel: Omit<Channel, 'id'>
): Promise<Channel> {
  return fetchApi(`/repos/${repoId}/channels`, {
    method: 'POST',
    body: JSON.stringify(channel),
  });
}

export async function updateChannel(
  repoId: string,
  channelId: string,
  updates: Partial<Omit<Channel, 'id'>>
): Promise<Channel> {
  return fetchApi(`/repos/${repoId}/channels/${channelId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteChannel(repoId: string, channelId: string): Promise<void> {
  return fetchApi(`/repos/${repoId}/channels/${channelId}`, {
    method: 'DELETE',
  });
}

// ============================================
// RELEASES
// ============================================

export interface ReleaseNotes {
  customer: string;
  developer: string;
  stakeholder: string;
  customerEdited?: boolean;
  developerEdited?: boolean;
  stakeholderEdited?: boolean;
  tokensUsed?: number;
  model?: string;
}

export interface Release {
  id: string;
  tagName: string;
  name: string | null;
  body: string | null;
  htmlUrl: string;
  publishedAt: string | null;
  status: string;
  processedAt: string | null;
  repo: {
    id: string;
    fullName: string;
    config?: {
      channels?: Channel[];
    };
  };
  notes: ReleaseNotes | null;
}

export async function getRelease(id: string): Promise<Release> {
  return fetchApi(`/releases/${id}`);
}

export async function regenerateNotes(id: string, options?: { tone?: string }): Promise<{ tokensUsed: number }> {
  return fetchApi(`/releases/${id}/regenerate`, {
    method: 'POST',
    body: JSON.stringify(options || {}),
  });
}

export async function publishRelease(id: string, channels?: string[]): Promise<{ status: string }> {
  return fetchApi(`/releases/${id}/publish`, {
    method: 'POST',
    body: JSON.stringify({ channels }),
  });
}

export async function updateReleaseNotes(id: string, notes: Partial<Pick<ReleaseNotes, 'customer' | 'developer' | 'stakeholder'>>): Promise<void> {
  return fetchApi(`/releases/${id}/notes`, {
    method: 'PATCH',
    body: JSON.stringify(notes),
  });
}

export interface ActivityRelease {
  id: string;
  tagName: string;
  name: string | null;
  publishedAt: string | null;
  htmlUrl: string;
  repo: {
    name: string;
    owner: string;
  }
}

export async function getActivity(): Promise<{ releases: ActivityRelease[] }> {
  return fetchApi('/activity');
}

// ============================================
// PUBLIC CHANGELOG
// ============================================

export interface ChangelogRelease {
  version: string;
  name: string | null;
  date: string;
  htmlUrl: string;
  notes: {
    customer: string;
    developer: string;
    stakeholder: string;
  } | null;
}

export interface Changelog {
  org: string;
  repo: string;
  fullName: string;
  description: string | null;
  productName: string;
  companyName: string;
  releases: ChangelogRelease[];
}

export async function getChangelog(org: string, repo: string, audience?: string): Promise<Changelog> {
  const params = audience ? `?audience=${audience}` : '';
  const res = await fetch(`/api/changelog/${org}/${repo}${params}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Not found' }));
    throw new Error(error.error || 'Changelog not found');
  }
  return res.json();
}

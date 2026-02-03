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
    throw new Error(error.error || error.message || 'Request failed');
  }

  return res.json();
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

// ============================================
// RELEASES
// ============================================

export interface Release {
  id: string;
  tagName: string;
  name: string | null;
  htmlUrl: string;
  publishedAt: string | null;
  status: string;
  notes?: {
    customer: string;
    developer: string;
    stakeholder: string;
  };
}

export async function getRelease(id: string): Promise<Release> {
  return fetchApi(`/releases/${id}`);
}

export async function regenerateNotes(id: string, options?: { format?: string; tone?: string }): Promise<void> {
  return fetchApi(`/releases/${id}/regenerate`, {
    method: 'POST',
    body: JSON.stringify(options || {}),
  });
}

export async function publishRelease(id: string, channels?: string[]): Promise<void> {
  return fetchApi(`/releases/${id}/publish`, {
    method: 'POST',
    body: JSON.stringify({ channels }),
  });
}

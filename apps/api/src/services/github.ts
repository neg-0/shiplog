/**
 * GitHub Service
 * Fetches release data, commits, and PRs from GitHub API
 */

interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  created_at: string;
}

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
    };
  };
  author: {
    login: string;
  } | null;
}

interface GitHubPR {
  number: number;
  title: string;
  body: string | null;
  user: {
    login: string;
  };
  labels: Array<{
    name: string;
  }>;
  merged_at: string | null;
}

interface GitHubCompareResponse {
  commits: GitHubCommit[];
}

interface GitHubWebhookResponse {
  id: number;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
  description: string | null;
}

export interface ReleaseData {
  release: {
    id: number;
    tagName: string;
    name: string | null;
    body: string | null;
    htmlUrl: string;
    isDraft: boolean;
    isPrerelease: boolean;
    publishedAt: Date | null;
  };
  previousTag: string | null;
  commits: Array<{
    sha: string;
    message: string;
    author: string;
  }>;
  pullRequests: Array<{
    number: number;
    title: string;
    body: string | null;
    author: string;
    labels: string[];
  }>;
}

// ============================================
// HELPERS
// ============================================

function getHeaders(accessToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  return headers;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Parse a Link header and return the URL for the given rel value (e.g. "next").
 */
function parseLinkHeader(linkHeader: string, rel: string): string | null {
  const parts = linkHeader.split(',');
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match && match[2] === rel && match[1]) {
      return match[1];
    }
  }
  return null;
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Fetch detailed release data including commits and PRs between the given tag and the previous one.
 */
export async function fetchReleaseData(
  owner: string,
  repo: string,
  tagName: string,
  accessToken?: string
): Promise<ReleaseData> {
  const headers = getHeaders(accessToken);

  // 1. Get the release
  const releaseRes = await fetchWithTimeout(
    `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tagName}`,
    { headers }
  );

  if (!releaseRes.ok) {
    throw new Error(`Failed to fetch release: ${releaseRes.status}`);
  }

  const release = (await releaseRes.json()) as GitHubRelease;

  // 2. Get previous release tag
  const releasesRes = await fetchWithTimeout(
    `https://api.github.com/repos/${owner}/${repo}/releases?per_page=10`,
    { headers }
  );

  const releases = (await releasesRes.json()) as GitHubRelease[];
  const currentIndex = releases.findIndex(r => r.tag_name === tagName);
  const previousTag = currentIndex < releases.length - 1
    ? releases[currentIndex + 1]?.tag_name ?? null
    : null;

  // 3. Get commits between tags
  let commits: Array<{ sha: string; message: string; author: string }> = [];

  if (previousTag) {
    const compareRes = await fetchWithTimeout(
      `https://api.github.com/repos/${owner}/${repo}/compare/${previousTag}...${tagName}`,
      { headers }
    );

    if (compareRes.ok) {
      const compareData = (await compareRes.json()) as GitHubCompareResponse;
      commits = (compareData.commits || []).map((c) => ({
        sha: c.sha,
        message: c.commit.message,
        author: c.author?.login || c.commit.author.name,
      }));
    }
  }

  // 4. Get merged PRs -- fetch in parallel batches
  const prNumbers = extractPRNumbers(commits.map(c => c.message));
  const pullRequests: ReleaseData['pullRequests'] = [];

  const CONCURRENCY = 5;
  const limitedPrNumbers = prNumbers.slice(0, 20);

  for (let i = 0; i < limitedPrNumbers.length; i += CONCURRENCY) {
    const batch = limitedPrNumbers.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (prNumber) => {
        try {
          const prRes = await fetchWithTimeout(
            `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
            { headers }
          );

          if (prRes.ok) {
            const pr = (await prRes.json()) as GitHubPR;
            return {
              number: pr.number,
              title: pr.title,
              body: pr.body,
              author: pr.user.login,
              labels: pr.labels.map(l => l.name),
            };
          }
          return null;
        } catch {
          return null;
        }
      })
    );
    pullRequests.push(...results.filter(Boolean) as ReleaseData['pullRequests']);
  }

  return {
    release: {
      id: release.id,
      tagName: release.tag_name,
      name: release.name,
      body: release.body,
      htmlUrl: release.html_url,
      isDraft: release.draft,
      isPrerelease: release.prerelease,
      publishedAt: release.published_at ? new Date(release.published_at) : null,
    },
    previousTag,
    commits,
    pullRequests,
  };
}

/**
 * Extract PR numbers from a list of commit messages.
 */
function extractPRNumbers(messages: string[]): number[] {
  const prNumbers = new Set<number>();

  for (const message of messages) {
    // Match "Merge pull request #123"
    const mergeMatch = message.match(/Merge pull request #(\d+)/);
    if (mergeMatch && mergeMatch[1]) {
      prNumbers.add(parseInt(mergeMatch[1], 10));
    }

    // Match "(#456)" at end of message (squash merge format)
    const squashMatch = message.match(/\(#(\d+)\)$/);
    if (squashMatch && squashMatch[1]) {
      prNumbers.add(parseInt(squashMatch[1], 10));
    }
  }

  return Array.from(prNumbers);
}

/**
 * Create a webhook on a GitHub repository to listen for release events.
 */
export async function createWebhook(
  owner: string,
  repo: string,
  webhookUrl: string,
  secret: string,
  accessToken: string
): Promise<{ id: number }> {
  const headers = getHeaders(accessToken);

  const response = await fetchWithTimeout(
    `https://api.github.com/repos/${owner}/${repo}/hooks`,
    {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'web',
        config: {
          url: webhookUrl,
          content_type: 'json',
          secret: secret,
          insecure_ssl: '0',
        },
        events: ['release'],
        active: true,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create webhook: ${response.status} ${error}`);
  }

  const data = (await response.json()) as GitHubWebhookResponse;
  return { id: data.id };
}

/**
 * Delete a webhook from a GitHub repository.
 */
export async function deleteWebhook(
  owner: string,
  repo: string,
  webhookId: number,
  accessToken: string
): Promise<void> {
  const headers = getHeaders(accessToken);

  const response = await fetchWithTimeout(
    `https://api.github.com/repos/${owner}/${repo}/hooks/${webhookId}`,
    {
      method: 'DELETE',
      headers,
    }
  );

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete webhook: ${response.status}`);
  }
}

/**
 * List repositories accessible to the authenticated user.
 * Paginates through all results (up to 10 pages / 1000 repos).
 */
export async function listUserRepos(
  accessToken: string
): Promise<Array<{ id: number; name: string; full_name: string; owner: string; description: string | null }>> {
  const headers = getHeaders(accessToken);
  const MAX_PAGES = 10;
  const allRepos: Array<{ id: number; name: string; full_name: string; owner: string; description: string | null }> = [];

  let nextUrl: string | null = 'https://api.github.com/user/repos?per_page=100&sort=updated';
  let page = 0;

  while (nextUrl && page < MAX_PAGES) {
    const response = await fetchWithTimeout(nextUrl, { headers });

    if (!response.ok) {
      throw new Error(`Failed to list repos: ${response.status}`);
    }

    const repos = (await response.json()) as GitHubRepo[];
    allRepos.push(
      ...repos.map((r) => ({
        id: r.id,
        name: r.name,
        full_name: r.full_name,
        owner: r.owner.login,
        description: r.description,
      }))
    );

    const linkHeader = response.headers.get('Link');
    nextUrl = linkHeader ? parseLinkHeader(linkHeader, 'next') : null;
    page++;
  }

  return allRepos;
}

/**
 * List recent releases for a specific repository.
 */
export async function listReleases(
  owner: string,
  repo: string,
  accessToken?: string,
  perPage = 5
): Promise<GitHubRelease[]> {
  const headers = getHeaders(accessToken);

  const response = await fetchWithTimeout(
    `https://api.github.com/repos/${owner}/${repo}/releases?per_page=${perPage}`,
    { headers }
  );

  if (!response.ok) {
    throw new Error(`Failed to list releases: ${response.status}`);
  }

  return response.json() as Promise<GitHubRelease[]>;
}

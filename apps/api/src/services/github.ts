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

/**
 * Fetch detailed release data including commits and PRs between the given tag and the previous one.
 *
 * @description
 * This function performs the following steps:
 * 1. Fetches the specific release by tag name.
 * 2. Identifies the previous release tag to establish a comparison range.
 * 3. Fetches commits between the previous tag and the current tag.
 * 4. Extracts Pull Request numbers from commit messages and fetches details for each PR.
 *
 * @param owner - The owner of the repository (e.g., "facebook").
 * @param repo - The name of the repository (e.g., "react").
 * @param tagName - The tag name of the release to fetch (e.g., "v1.0.0").
 * @param accessToken - GitHub OAuth access token with repo scope.
 * @returns A promise that resolves to `ReleaseData` containing release info, commits, and PRs.
 * @throws Error if the release cannot be fetched or if the GitHub API returns an error.
 *
 * @example
 * const data = await fetchReleaseData('facebook', 'react', 'v18.0.0', 'gho_token...');
 */
export async function fetchReleaseData(
  owner: string,
  repo: string,
  tagName: string,
  accessToken: string
): Promise<ReleaseData> {
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // 1. Get the release
  const releaseRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tagName}`,
    { headers }
  );
  
  if (!releaseRes.ok) {
    throw new Error(`Failed to fetch release: ${releaseRes.status}`);
  }
  
  const release = (await releaseRes.json()) as GitHubRelease;

  // 2. Get previous release tag
  const releasesRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases?per_page=10`,
    { headers }
  );
  
  const releases = (await releasesRes.json()) as GitHubRelease[];
  const currentIndex = releases.findIndex(r => r.tag_name === tagName);
  const previousTag = currentIndex < releases.length - 1 
    ? releases[currentIndex + 1]?.tag_name 
    : null;

  // 3. Get commits between tags
  let commits: Array<{ sha: string; message: string; author: string }> = [];
  
  if (previousTag) {
    const compareRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/compare/${previousTag}...${tagName}`,
      { headers }
    );
    
    if (compareRes.ok) {
      const compareData = (await compareRes.json()) as any;
      commits = ((compareData.commits as GitHubCommit[]) || []).map((c: GitHubCommit) => ({
        sha: c.sha,
        message: c.commit.message,
        author: c.author?.login || c.commit.author.name,
      }));
    }
  }

  // 4. Get merged PRs (extract from commit messages or fetch separately)
  // For now, extract PR numbers from commit messages and fetch them
  const prNumbers = extractPRNumbers(commits.map(c => c.message));
  
  const pullRequests: ReleaseData['pullRequests'] = [];
  
  for (const prNumber of prNumbers.slice(0, 20)) { // Limit to 20 PRs
    try {
      const prRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
        { headers }
      );
      
      if (prRes.ok) {
        const pr = (await prRes.json()) as GitHubPR;
        pullRequests.push({
          number: pr.number,
          title: pr.title,
          body: pr.body,
          author: pr.user.login,
          labels: pr.labels.map(l => l.name),
        });
      }
    } catch {
      // Skip failed PR fetches
    }
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
 *
 * @description
 * Parses commit messages to find PR references. Supports standard GitHub merge commits
 * ("Merge pull request #123") and squash merge formats ("(#456)").
 *
 * @param messages - An array of commit messages.
 * @returns An array of unique PR numbers found in the messages.
 */
function extractPRNumbers(messages: string[]): number[] {
  const prNumbers = new Set<number>();
  
  for (const message of messages) {
    // Match "Merge pull request #123"
    const mergeMatch = message.match(/Merge pull request #(\d+)/);
    if (mergeMatch) {
      prNumbers.add(parseInt(mergeMatch[1], 10));
    }
    
    // Match "(#456)" at end of message (squash merge format)
    const squashMatch = message.match(/\(#(\d+)\)$/);
    if (squashMatch) {
      prNumbers.add(parseInt(squashMatch[1], 10));
    }
  }
  
  return Array.from(prNumbers);
}

/**
 * Create a webhook on a GitHub repository to listen for release events.
 *
 * @param owner - The owner of the repository.
 * @param repo - The name of the repository.
 * @param webhookUrl - The URL where GitHub should send webhook events.
 * @param secret - The shared secret for validating webhook payloads.
 * @param accessToken - GitHub OAuth access token with repo scope.
 * @returns A promise that resolves to an object containing the new webhook's ID.
 * @throws Error if the webhook creation fails.
 */
export async function createWebhook(
  owner: string,
  repo: string,
  webhookUrl: string,
  secret: string,
  accessToken: string
): Promise<{ id: number }> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/hooks`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
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

  const data = (await response.json()) as any;
  return { id: data.id as number };
}

/**
 * Delete a webhook from a GitHub repository.
 *
 * @param owner - The owner of the repository.
 * @param repo - The name of the repository.
 * @param webhookId - The ID of the webhook to delete.
 * @param accessToken - GitHub OAuth access token with repo scope.
 * @returns A promise that resolves when the webhook is deleted.
 * @throws Error if the deletion fails (unless it's a 404 Not Found, which is ignored).
 */
export async function deleteWebhook(
  owner: string,
  repo: string,
  webhookId: number,
  accessToken: string
): Promise<void> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/hooks/${webhookId}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    }
  );

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete webhook: ${response.status}`);
  }
}

/**
 * List repositories accessible to the authenticated user.
 *
 * @description
 * Fetches up to 100 repositories sorted by updated date.
 *
 * @param accessToken - GitHub OAuth access token.
 * @returns A promise that resolves to an array of repositories with basic details.
 * @throws Error if the API request fails.
 */
export async function listUserRepos(
  accessToken: string
): Promise<Array<{ id: number; name: string; full_name: string; owner: string; description: string | null }>> {
  const response = await fetch(
    'https://api.github.com/user/repos?per_page=100&sort=updated',
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to list repos: ${response.status}`);
  }

  const repos = (await response.json()) as any[];
  
  return repos.map((r: any) => ({
    id: r.id,
    name: r.name,
    full_name: r.full_name,
    owner: r.owner.login,
    description: r.description,
  }));
}

/**
 * List recent releases for a specific repository.
 *
 * @param owner - The owner of the repository.
 * @param repo - The name of the repository.
 * @param accessToken - GitHub OAuth access token.
 * @param perPage - The number of releases to fetch (default: 5).
 * @returns A promise that resolves to an array of `GitHubRelease` objects.
 * @throws Error if the API request fails.
 */
export async function listReleases(
  owner: string,
  repo: string,
  accessToken: string,
  perPage = 5
): Promise<GitHubRelease[]> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases?per_page=${perPage}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to list releases: ${response.status}`);
  }

  return response.json() as Promise<GitHubRelease[]>;
}

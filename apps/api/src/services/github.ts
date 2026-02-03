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
 * Fetch release data with commits and PRs between tags
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
  
  const release: GitHubRelease = await releaseRes.json();

  // 2. Get previous release tag
  const releasesRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases?per_page=10`,
    { headers }
  );
  
  const releases: GitHubRelease[] = await releasesRes.json();
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
      const compareData = await compareRes.json();
      commits = (compareData.commits || []).map((c: GitHubCommit) => ({
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
        const pr: GitHubPR = await prRes.json();
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
 * Extract PR numbers from commit messages
 * Matches patterns like: "Merge pull request #123" or "(#456)"
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
 * Create a webhook on a repository
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

  const data = await response.json();
  return { id: data.id };
}

/**
 * Delete a webhook from a repository
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
 * List user's repositories
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

  const repos = await response.json();
  
  return repos.map((r: any) => ({
    id: r.id,
    name: r.name,
    full_name: r.full_name,
    owner: r.owner.login,
    description: r.description,
  }));
}

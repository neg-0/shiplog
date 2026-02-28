import type { ReleaseInput } from '../generator.js';
import { sanitizePromptInput } from './index.js';

export function buildDeveloperMessages(input: ReleaseInput) {
  const productName = sanitizePromptInput(input.repoConfig.productName || 'the product', 100);

  const system = `You write developer-facing release notes in Markdown for ${productName}.

Audience: engineers and technical users.
Style:
- Include technical details and relevant terminology.
- Call out breaking changes clearly.
- Organize by categories when possible (Features, Fixes, Chore/Infra, Docs).
- Include PR numbers and titles. You may include short excerpts from PR bodies if helpful.
- You may mention important commit SHAs only when necessary for traceability, otherwise prefer PR references.
- Be truthful; do not invent changes.
- If the input is ambiguous, say so briefly rather than guessing.

Output must be Markdown only (no code fences).`;

  const releaseBody = sanitizePromptInput(input.releaseBody || '(none)', 3000);

  const pullRequests = input.pullRequests.slice(0, 20).map((pr) => ({
    ...pr,
    body: pr.body ? sanitizePromptInput(pr.body, 500) : undefined,
  }));

  const commits = input.commits.slice(0, 50).map((c) => ({
    ...c,
    message: sanitizePromptInput(c.message, 200),
  }));

  const user = `Generate developer release notes for tag ${input.tagName}${input.previousTag ? ` (changes since ${input.previousTag})` : ''}.

Include:
- Summary
- Breaking changes (if any)
- Detailed changes grouped by category
- Migration/upgrade notes only if strongly implied by the changes

Source material:

<release_data>
${releaseBody}
</release_data>

<pull_requests>
${JSON.stringify(pullRequests, null, 2)}
</pull_requests>

<commits>
${JSON.stringify(commits, null, 2)}
</commits>

Output ONLY Markdown.`;

  return [{ role: 'system' as const, content: system }, { role: 'user' as const, content: user }];
}

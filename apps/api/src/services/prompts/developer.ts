import type { ReleaseInput } from '../types';

export function buildDeveloperMessages(input: ReleaseInput) {
  const productName = input.repoConfig.productName || 'the product';

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

  const user = `Generate developer release notes for tag ${input.tagName}${input.previousTag ? ` (changes since ${input.previousTag})` : ''}.

Include:
- Summary
- Breaking changes (if any)
- Detailed changes grouped by category
- Migration/upgrade notes only if strongly implied by the changes

Source material:
- Original GitHub release body:\n${input.releaseBody || '(none)'}

Pull requests:\n${JSON.stringify(input.pullRequests, null, 2)}

Commits:\n${JSON.stringify(input.commits, null, 2)}

Output ONLY Markdown.`;

  return [{ role: 'system' as const, content: system }, { role: 'user' as const, content: user }];
}

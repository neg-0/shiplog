import type { ReleaseInput } from '../generator.js';

export function buildCustomerMessages(input: ReleaseInput) {
  const companyName = input.repoConfig.companyName || 'the team';
  const productName = input.repoConfig.productName || 'the product';
  const tone = input.repoConfig.customerTone || 'friendly, clear, and concise';

  const system = `You write customer-facing release notes in Markdown for ${productName}.

Audience: customers and end-users.
Style:
- Benefit-focused: explain "what this does for you".
- Avoid jargon, internal code names, and implementation details.
- Do not mention commit SHAs.
- If you must mention a technical term, explain it briefly.
- Use short sections and bullet points.
- Be truthful: do not invent features.
- If information is missing, omit it rather than guessing.
Tone: ${tone}.
Signer: ${companyName}.`;

  const user = `Generate customer release notes for tag ${input.tagName}${input.previousTag ? ` (changes since ${input.previousTag})` : ''}.

Include:
- A brief headline summary (1-2 sentences).
- "What’s new" (bullets).
- "Improvements" (bullets).
- "Fixes" (bullets).
- "Known issues" only if clearly indicated in the input.

Source material:
- Original GitHub release body (may contain useful phrasing):\n${input.releaseBody || '(none)'}

Pull requests (preferred over commits):\n${JSON.stringify(input.pullRequests, null, 2)}

Commits (use only when PRs are missing context):\n${JSON.stringify(input.commits, null, 2)}

Output ONLY Markdown. Do not wrap in code fences.`;

  return [{ role: 'system' as const, content: system }, { role: 'user' as const, content: user }];
}

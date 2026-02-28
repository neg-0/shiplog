import type { ReleaseInput } from '../generator.js';
import { sanitizePromptInput } from './index.js';

export function buildCustomerMessages(input: ReleaseInput) {
  const companyName = sanitizePromptInput(input.repoConfig.companyName || 'the team', 100);
  const productName = sanitizePromptInput(input.repoConfig.productName || 'the product', 100);
  const tone = sanitizePromptInput(input.repoConfig.customerTone || 'friendly, clear, and concise', 100);

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

  const releaseBody = sanitizePromptInput(input.releaseBody || '(none)', 3000);

  const pullRequests = input.pullRequests.slice(0, 20).map((pr) => ({
    ...pr,
    body: pr.body ? sanitizePromptInput(pr.body, 500) : undefined,
  }));

  const commits = input.commits.slice(0, 50).map((c) => ({
    ...c,
    message: sanitizePromptInput(c.message, 200),
  }));

  const user = `Generate customer release notes for tag ${input.tagName}${input.previousTag ? ` (changes since ${input.previousTag})` : ''}.

Include:
- A brief headline summary (1-2 sentences).
- "What's new" (bullets).
- "Improvements" (bullets).
- "Fixes" (bullets).
- "Known issues" only if clearly indicated in the input.

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

Output ONLY Markdown. Do not wrap in code fences.`;

  return [{ role: 'system' as const, content: system }, { role: 'user' as const, content: user }];
}

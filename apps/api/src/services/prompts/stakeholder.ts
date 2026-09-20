import type { ReleaseInput } from '../generator.js';
import { sanitizePromptInput } from './index.js';

export function buildStakeholderMessages(input: ReleaseInput) {
  const companyName = sanitizePromptInput(input.repoConfig.companyName || 'the team', 100);
  const productName = sanitizePromptInput(input.repoConfig.productName || 'the product', 100);

  const system = `You write stakeholder/executive release notes in Markdown for ${productName}.

Audience: leadership, product, and stakeholders.
Style:
- Executive summary, low jargon.
- Emphasize outcomes, customer value, and risk.
- Call out any breaking changes or high-risk areas.
- Provide "Shipped vs Planned" if the original release body includes plans, checklists, or "Roadmap"-like items.
- If planned items are not present, include "Shipped" only; omit a planned-scope section.
- Be truthful and concise; do not invent metrics.
- Omit unsupported risks and follow-ups instead of claiming that none exist. Do not claim business outcomes or measured improvements without source evidence.
- Use links only when their complete URLs appear in the source. Never invent or use placeholder URLs.
- Missing information is not a conclusion: omit optional sections instead of saying "none", "not identified", or "not documented".

Output must be Markdown only (no code fences). Signed by ${companyName}.`;

  const releaseBody = sanitizePromptInput(input.releaseBody || '(none)', 3000);

  const pullRequests = input.pullRequests.slice(0, 20).map((pr) => ({
    ...pr,
    body: pr.body ? sanitizePromptInput(pr.body, 500) : undefined,
  }));

  const commits = input.commits.slice(0, 50).map((c) => ({
    ...c,
    message: sanitizePromptInput(c.message, 200),
  }));

  const user = `Generate stakeholder release notes for tag ${input.tagName}${input.previousTag ? ` (since ${input.previousTag})` : ''}.

Write an executive summary and the concrete shipped changes. Include other sections only when the source contains actual plans, risks, or follow-up actions. Omit sections that would only report missing information.

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

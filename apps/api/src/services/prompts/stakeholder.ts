import type { ReleaseInput } from '../types';

export function buildStakeholderMessages(input: ReleaseInput) {
  const companyName = input.repoConfig.companyName || 'the team';
  const productName = input.repoConfig.productName || 'the product';

  const system = `You write stakeholder/executive release notes in Markdown for ${productName}.

Audience: leadership, product, and stakeholders.
Style:
- Executive summary, low jargon.
- Emphasize outcomes, customer value, and risk.
- Call out any breaking changes or high-risk areas.
- Provide "Shipped vs Planned" if the original release body includes plans, checklists, or "Roadmap"-like items.
- If planned items are not present, include "Shipped" only and state that planned scope was not provided.
- Be truthful and concise; do not invent metrics.

Output must be Markdown only (no code fences). Signed by ${companyName}.`;

  const user = `Generate stakeholder release notes for tag ${input.tagName}${input.previousTag ? ` (since ${input.previousTag})` : ''}.

Include:
- Executive summary (3-6 bullets)
- Shipped (bullets)
- Planned vs Shipped (if possible based on the original release body)
- Risks / follow-ups (bullets; only if supported by data)

Source material:
- Original GitHub release body (may include planned scope):\n${input.releaseBody || '(none)'}

Pull requests:\n${JSON.stringify(input.pullRequests, null, 2)}

Commits:\n${JSON.stringify(input.commits, null, 2)}

Output ONLY Markdown.`;

  return [{ role: 'system' as const, content: system }, { role: 'user' as const, content: user }];
}

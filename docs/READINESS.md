# ShipLog readiness review — 2026-09-19

## Assessment

ShipLog has a useful core: turn a GitHub release into three audience-specific drafts, review them, and publish a hosted changelog or send selected Slack/Discord updates. The shipped revision was `ca0e64dcda7342e46a61f4148367926adb7545cb`. The public site and API health check were available during this review; the latest GitHub CI run passed.

The cleanup in this branch addresses reliability and presentation problems that would obstruct activation. It does **not** establish customer demand or prove the production OAuth → release → payment journey end to end. Keep the first rollout a small, observed pilot.

## Fixed in this branch

- **Sign-in:** one-time OAuth exchange no longer repeats under React Strict Mode or leaves returning users loading indefinitely. Exchange codes expire when checked; session cookies match the existing one-hour JWT lifetime. OAuth state cleanup uses the same domain as creation.
- **Release review and privacy:** automatic generation/publishing settings are honored; unreviewed notes and GitHub drafts are excluded from public endpoints. Newly connected repositories start private. Public visibility has one functional setting.
- **Publishing:** the manual action now actually sends selected Slack/Discord channels, supports hosted-only publication, records outcomes, reports partial delivery, and skips recorded successful deliveries on retries. Concurrent publication is claimed atomically. An external send whose database record cannot be saved is flagged for support review before retry.
- **Repository lifecycle:** verify the selected GitHub repository; create configuration atomically; do not discard stored webhook identity/secret when disconnect fails. Imports exclude drafts; tag paths are encoded.
- **Billing:** reject duplicate checkout for existing subscriptions; unknown paid price mappings fail for retry rather than silently demoting to FREE; stale billing events cannot overwrite organization entitlement. Account deletion cannot leave a live subscription billable or orphan connected GitHub webhooks. Missing Stripe configuration no longer prevents API startup.
- **Frontend:** public release note data shape corrected; edits survive audience changes; unsaved edits cannot be published or overwritten silently; billing and settings errors recover; dialogs support keyboard focus; Markdown has readable typography; mobile navigation fits.
- **Acquisition:** visitors can compare an explicitly illustrative release across three audiences without signing in. Fixed broken social-sharing image, homepage hydration, mobile pricing, unsupported feature claims, and misleading OAuth permission copy. Incomplete organization creation/invitation UI is disabled with an explanation; existing lists remain available.
- **Dependencies and deploy checks:** patched Next.js/React/Hono and vulnerable transitive libraries. Production dependency audit is clean. Added a production build CI job. Local development and browser tests target a local API. Railway configuration uses a lockfile and no longer opts into destructive schema synchronization.

## Validation

- API: 31 suites / 271 tests passed in a clean standalone install on Node 20.20.2 and npm 10.9.9, matching the deployment runtime major versions. API build and TypeScript check passed.
- Frontend: 15 suites / 86 tests passed, TypeScript passed, and the production build completed.
- Browser: 34 Chromium checks passed against the production build, including 390px layout, example audience switching, and returning-visitor hydration. Desktop/mobile pages were also visually inspected.
- Dependency audit: 0 production advisories in both the pnpm workspace and the standalone npm API deployment lock.
- Provider calls and persistence are mocked in these regression tests. This is local validation; it does not replace the live checks below.

## Release gates

1. **Deploy the reviewed revision and inspect both platforms.** API currently deploys from `apps/api` on Railway; web is on Vercel. Verify terminal deployment success, health, built revision, and that Railway applies the checked-in pre-deploy command without `--accept-data-loss`. No schema changes are included here. Existing destructive drift should stop deployment for review.
2. **Repair the existing webhook mismatch.** Production logs contain repeated invalid signatures for the connected CompIQ repository. A stale duplicate hook is plausible, not confirmed. Compare GitHub hook IDs/URLs to the stored `webhookId` before rotating anything. Then reconcile the active hook and stored secret together, and redeliver a known event. Do not weaken HMAC validation.
3. **Run one real customer journey.** GitHub sign-in through the canonical domain → connect a repository → import/generate a release → edit each audience → publish hosted-only → verify the public page → send to an explicitly chosen test channel. Local tests mock providers and do not prove OAuth configuration, LLM output quality, webhook delivery, or payment-provider settings.
4. **Verify billing in Stripe test mode.** Free → Pro trial → Team change → cancel → webhook replay/out-of-order events. Confirm the configured `STRIPE_PRICE_PRO` / `STRIPE_PRICE_TEAM` values and customer portal settings. No charges, live provider generation, outbound channel sends, or production changes occurred during this review.

## Product scope before charging broadly

- Repository-count limits and TEAM-only organization creation are enforced. Paid-only automation/channel restrictions remain incomplete: FREE can configure automation and delivery channels. Decide and enforce the paid boundary before relying on this as a conversion mechanism; this cleanup does not introduce a surprise entitlement cutoff for existing accounts.
- Email delivery exists in the backend but has no complete recipient-management UI. Email setup is no longer advertised as a self-serve plan feature.
- Organization invitations have no complete acceptance UI or email delivery, and repository association is not self-serve. New organization/invite actions are disabled; do not advertise team collaboration yet. Existing organization owners require support to resolve ownership before deleting their account.
- Custom audiences, general API access, and scheduled email digests are not supported end to end. They are not part of the current paid promise.
- Channel delivery is not exactly-once: provider timeouts can occur after a POST was accepted. Recorded successes and concurrent calls are protected, but uncertain provider outcomes still need investigation.

## Small pilot to test traction

Start with five maintainers of products that already publish GitHub releases at least monthly and currently rewrite updates for nontechnical users. Observe setup and their first publish. Track these simple outcomes manually before adding analytics:

| Question | Evidence to collect |
| --- | --- |
| Can they activate? | Connected a repository and published one useful changelog without help |
| Is the output useful? | Edits needed for accuracy/tone; unsupported claims; time spent reviewing |
| Do they return? | A second release published within their normal release cadence |
| Is there willingness to pay? | An explicit paid commitment after seeing their own output |

Advance beyond the pilot when the live journey works, output requires little correction, and at least a few users return for their next release. No outreach was sent and no customer-validation results are claimed.

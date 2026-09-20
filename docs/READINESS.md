# ShipLog readiness review — 2026-09-20 UTC

## Assessment

ShipLog has a useful core: turn a GitHub release into three audience-specific drafts, review them, and publish a hosted changelog or send selected Slack/Discord updates. The shipped revision was `ca0e64dcda7342e46a61f4148367926adb7545cb`. The public site and API health check were available during this review; the latest GitHub CI run passed.

The cleanup is published as [PR #40](https://github.com/neg-0/shiplog/pull/40). The initial cleanup revision `5b997c0` passed all six GitHub CI jobs and its Vercel preview deployment. Follow-up fixes remain subject to independent review and CI on the final release revision. Production still runs the original revision until the release records below are updated.

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

## Additional fixes from independent review

- Checkout sends the required JSON request. Billing and account deletion coordinate against Stripe state and preserve customer identity across failed checkout operations.
- Stable new changelog slugs and unambiguous legacy resolution support hyphenated GitHub owners. Public pages are uncached so privacy changes apply on the next request.
- New connections import metadata without calling AI. Generation is an explicit action or automation opt-in, with provider disclosure. Import screens refresh and expose retry controls.
- Free supports manual generation, editing, and hosted publication. Pro/Team automation and channel access are enforced both at configuration and execution. Existing explicitly listed repositories can retain their previous access without changing a Stripe subscription.
- GitHub events are persisted before a fast 202 acknowledgement. Interrupted generation becomes retryable; interrupted or uncertain publication requires reconciliation. Claims and edits are fenced to prevent stale requests overwriting work or repeating delivery.
- Slack/Discord sends accept official webhook destinations only and do not follow redirects. Network failures and server errors are treated as uncertain delivery; POSTs are not automatically retried.
- Synthetic AI output review caught invented links and unsupported guidance. Prompts were tightened and the final inspected sample is recorded in [the output sample](READINESS-OUTPUT-SAMPLE.md). This is not customer validation or a guarantee of every future draft.

## Validation

- Latest full API run: **32 suites / 355 tests passed**, plus TypeScript. The original cleanup also passed a clean standalone install/build/audit on Node 20.20.2 and npm 10.9.9.
- Latest frontend run: **17 suites / 101 tests passed**, plus nonincremental TypeScript.
- A disposable PostgreSQL journey passed with real OAuth exchange/cookies, Prisma persistence, import, three drafts, editing, hosted publication, private rejection, and public visibility. External GitHub/AI calls are simulated; all unexpected fetch destinations are rejected. It is now included in the standalone API CI job.
- Historical browser/build evidence: 34 Chromium checks and both production builds passed for the initial cleanup. Final CI must repeat those checks on the release revision.
- Synthetic-only live AI generation succeeded. The final sample used 1,799 tokens across the three audiences; see the linked source/output review above. No private repository material was used.
- Both production dependency audits were clean at the initial cleanup; dependencies and lockfiles have not changed in the follow-up. Final standalone CI repeats its audit.
- Desktop (1512px) and mobile (390px) repository, settings, and release views were inspected with synthetic fixtures. Audience switching, Free-plan controls, privacy messaging, and private publication worked. Title wrapping was corrected and rechecked; mobile content had no horizontal overflow. The publish dialog was inspected before a small padding adjustment; automatic approval review blocked reopening the Retry delivery control, interpreting it as a possible send, so that action was not retried. These checks do not establish a deployed customer journey or Stripe lifecycle success.

## Live configuration and remaining release gates

- **GitHub webhook identity repaired:** production DB records CompIQ hook `595138372`. GitHub had that hook plus stale hook `594944149`, both targeting `https://api.shiplog.io/webhooks/github`. The stale hook's published events returned 401; the intended hook reached processing but exceeded GitHub's response deadline. On September 20 UTC, only stale hook `594944149` was disabled. The intended hook remains active, with unchanged secret/signature verification. No events were replayed and no recipients were notified. The new fast-acknowledgement code still needs deployment and safe live verification.
- **Existing-account impact checked read-only:** five users, two connected repositories, no organizations. Both connected repositories belong to the existing Free account and have automation and a Slack/Discord channel enabled. Its Stripe subscription is active on an archived $0 price, which is not a reason to invent a paid-tier mapping. The Railway variable `GRANDFATHERED_REPO_IDS` was set without triggering a deployment and read back as `cmlbvyo6u0002u5t7h5nx0jji,cmlh4m8ek0007u5t7ic8jlo11` to preserve those configurations. The new deployed API must still be checked for effective access.
- **Stripe:** both expected price-variable names are populated; the current restricted live key cannot read those prices. The key can read checkout sessions and subscriptions, which the repaired billing safeguards require. The default portal enables cancellation and plan updates. Configured price amounts/products and test-mode lifecycle behavior remain unverified. No live charges were created. A dedicated Stripe test key, test prices, and webhook secret are needed; keep secrets in an ignored local environment file, never in this document or chat.
- **OAuth/config:** production API URL is `https://api.shiplog.io`, app URL is `https://shiplog.io`, and OAuth state-cookie domain is `.shiplog.io`. Canonical web traffic redirects to `www.shiplog.io`. Host-only session cookies and the cross-subdomain callback still need a real dedicated-account login test.
- **Railway:** API deployment `f9d6db3a-279b-41ab-a94e-54d1df951f56` is successful at `ca0e64d`. Its historical resolved pre-deploy command still contains `--accept-data-loss`. The candidate explicitly overrides it without that flag. Verify the new deployment's resolved command and terminal success; do not infer this from the checked-in file alone. A read-only Prisma comparison against production returned an empty migration; no schema changes are required.
- **Vercel:** GitHub's deployment records identify production at `ca0e64d` and a successful cleanup preview at `5b997c0`. CLI authentication is unavailable; an account-security prompt blocked dashboard inspection. Deployment records and live HTTP checks remain available. Verify production environment, final SHA, and terminal success after release.
- **Dedicated live journey still required:** sign in → connect an approved test repository → import/receive a release → generate three drafts → edit → publish hosted-only → enable public access and inspect the changelog. A Slack/Discord send requires an explicitly approved test destination. Do not use private repository content for provider tests without authorization. Synthetic provider and local persistence tests are not substitutes.

## Rollback and recovery

1. Record both platform deployment IDs and the exact released SHA before rollout. Require independent review and all required CI checks for that SHA. Confirm the remote main branch has not advanced before integration.
2. If a rollout fails health or customer smoke checks, preserve logs and restore the last verified deployment through the platform rollback controls. Inspect the resolved Railway pre-deploy command first: **never run the old data-loss command as part of rollback**. If artifact rollback cannot preserve safe configuration, prepare a code revert that retains the safe deployment command and dependency locks, review/test it, and deploy that revision.
3. No database schema change is planned. Do not reset or restore production data to roll back application code. Keep the explicit grandfather list when rolling code back; the prior code ignores it.
4. Generation interrupted before acknowledgement remains recorded. Pending releases can be generated manually; generation claims older than ten minutes recover when accessed. A publication review marker or unknown legacy processing state must not be cleared just to retry: inspect the named destinations and saved distribution records, then reconcile the outcome through support. Do not send another message until its prior delivery is understood.
5. The stale-hook change is reversible through GitHub's hook settings, but re-enabling it with the old mismatched secret will restore signature failures. Preserve intended hook `595138372`; do not rotate or recreate it speculatively.

## Product scope before charging broadly

- Repository-count limits and paid automation/channel boundaries are enforced in the candidate. Existing access is preserved only through the explicit repository compatibility list described above. Manual generation and hosted publication remain available on Free.
- Email delivery exists in the backend but has no complete recipient-management UI. Email setup is no longer advertised as a self-serve plan feature.
- Organization invitations have no complete acceptance UI or email delivery, and repository association is not self-serve. New organization/invite actions are disabled; do not advertise team collaboration yet. Existing organization owners require support to resolve ownership before deleting their account.
- Custom audiences, general API access, and scheduled email digests are not supported end to end. They are not part of the current paid promise.
- Channel delivery is not exactly-once: provider timeouts can occur after acceptance. Recorded successes and concurrent calls are protected. Uncertain outcomes block retries pending support reconciliation; explicit failures such as rate limits can be retried.

## Small pilot to test traction

Start with five maintainers of products that already publish GitHub releases at least monthly and currently rewrite updates for nontechnical users. Observe setup and their first publish. Track these simple outcomes manually before adding analytics:

| Question | Evidence to collect |
| --- | --- |
| Can they activate? | Connected a repository and published one useful changelog without help |
| Is the output useful? | Edits needed for accuracy/tone; unsupported claims; time spent reviewing |
| Do they return? | A second release published within their normal release cadence |
| Is there willingness to pay? | An explicit paid commitment after seeing their own output |

Advance beyond the pilot when the live journey works, output requires little correction, and at least a few users return for their next release. No outreach was sent and no customer-validation results are claimed.

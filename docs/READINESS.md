# ShipLog readiness review — 2026-09-20 UTC

## Assessment

ShipLog has a useful core: turn a GitHub release into three audience-specific drafts, review them, and publish a hosted changelog or send selected Slack/Discord updates. The pre-cleanup revision was `ca0e64dcda7342e46a61f4148367926adb7545cb`. The public site and API health check were available during this review; the latest GitHub CI run passed.

The cleanup was merged through [PR #40](https://github.com/neg-0/shiplog/pull/40) and deployed at **`39586840803d6f9a8f759167dcbc5f702022869a`** on September 20, 2026 UTC. Independent review and all six required CI jobs passed on that exact revision before a fast-forward integration to main. Both production platforms reported terminal success for the same SHA.

**Deployment verified; full production readiness remains unproven.** The released cleanup addresses reliability and presentation problems that would obstruct activation. It does not establish customer demand or prove the production OAuth → release → payment journey end to end. Hosted-only activation needs a dedicated test account/repository. Billing needs isolated Stripe test credentials and separate live-price read access. External delivery additionally needs an approved channel destination. Keep the first rollout a small, observed pilot.

## Released revision and production evidence

| Gate | Verified evidence |
| --- | --- |
| Independent review | PASS on `39586840803d6f9a8f759167dcbc5f702022869a`; the final concurrent customer-repair defect was reproduced, fixed, and independently re-reviewed |
| Required CI | [Run 35488777292](https://github.com/neg-0/shiplog/actions/runs/35488777292): all six jobs passed before release; 356 API tests, 101 frontend tests, 34 browser checks, both builds, TypeScript, standalone API audit, and disposable PostgreSQL journey |
| Integration | PR #40 merged at 04:20:18 UTC with merge revision equal to the reviewed SHA; no additional merge commit |
| Railway | Deployment `5af4dc82-a88b-4e4c-b562-8f25a3ff30bc`, SUCCESS; GitHub deployment `6548964953` also reported success at 04:22:01 UTC |
| Railway schema safety | Final resolved manifest uses `npx prisma db push --skip-generate`; logs report the database was already in sync. The platform fallback pre-deploy setting was also corrected to remove `--accept-data-loss` |
| Vercel | Production GitHub deployment `6548972600`, success at 04:21:23 UTC; [deployed artifact](https://shiplog-o3g0inotg-neg0.vercel.app), same reviewed SHA |
| Public smoke | Homepage, pricing, login, docs, hosted ShipLog changelog, sitemap, robots, and Open Graph image returned 200; bare domain redirected to `www.shiplog.io` |
| API and proxy smoke | Direct API and frontend `/api/health` returned 200; unauthenticated repository requests returned 401; unknown public slug returned 404; unsigned webhook returned 401 |
| OAuth configuration smoke | Direct and proxied sign-in initiation returned 302 to GitHub with callback `https://api.shiplog.io/auth/github/callback`; state cookie had `.shiplog.io`, Secure, HttpOnly, SameSite=Lax, and 600-second expiry; www CORS preflight passed |
| Production visual check | Homepage inspected at desktop and 390px mobile widths; mobile pricing and login inspected. The actual `/c/shiplog` changelog and `v0.1.0` detail rendered, and all three public audience tabs worked. Pricing and release-detail content widths matched the mobile viewport without horizontal overflow |
| Social image | Production Open Graph response contained a valid 32,909-byte PNG, 1200 × 630 pixels; rendered image inspected |

HTTP checks completed at 04:22:55 UTC; follow-up frontend proxy and hook-state checks also passed. These are public/configuration checks, not a signed-in customer journey. The readiness updates after deployment are documentation evidence; the application release remains the SHA above.

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

- Checkout sends the required JSON request. Billing and account deletion coordinate against Stripe state and preserve customer identity across failed checkout operations. Concurrent recovery of a deleted Stripe customer now preserves the first repaired customer and its open checkout; a regression reproduces the delayed-response race.
- Stable new changelog slugs and unambiguous legacy resolution support hyphenated GitHub owners. Public pages are uncached so privacy changes apply on the next request.
- New connections import metadata without calling AI. Generation is an explicit action or automation opt-in, with provider disclosure. Import screens refresh and expose retry controls.
- Free supports manual generation, editing, and hosted publication. Pro/Team automation and channel access are enforced both at configuration and execution. Existing explicitly listed repositories can retain their previous access without changing a Stripe subscription.
- GitHub events are persisted before a fast 202 acknowledgement. Interrupted generation becomes retryable; interrupted or uncertain publication requires reconciliation. Claims and edits are fenced to prevent stale requests overwriting work or repeating delivery.
- Slack/Discord sends accept official webhook destinations only and do not follow redirects. Network failures and server errors are treated as uncertain delivery; POSTs are not automatically retried.
- Synthetic AI output review caught invented links and unsupported guidance. Prompts were tightened and the final inspected sample is recorded in [the output sample](READINESS-OUTPUT-SAMPLE.md). This is not customer validation or a guarantee of every future draft.

## Validation

- Latest full API run: **32 suites / 356 tests passed**, plus TypeScript. The original cleanup also passed a clean standalone install/build/audit on Node 20.20.2 and npm 10.9.9.
- Latest frontend run: **17 suites / 101 tests passed**, plus nonincremental TypeScript.
- A disposable PostgreSQL journey passed with real OAuth exchange/cookies, Prisma persistence, import, three drafts, editing, hosted publication, private rejection, and public visibility. External GitHub/AI calls are simulated; all unexpected fetch destinations are rejected. It is now included in the standalone API CI job.
- All six CI jobs passed on the released revision `3958684`, including 34 browser checks, both production builds, and the disposable PostgreSQL journey. Its standalone API dependency audit found zero vulnerabilities.
- Synthetic-only live AI generation succeeded. The final sample used 1,799 tokens across the three audiences; see the linked source/output review above. No private repository material was used.
- Both production dependency audits were clean at the initial cleanup; dependencies and lockfiles have not changed in the follow-up. Final standalone CI repeated its audit.
- Desktop (1512px) and mobile (390px) repository, settings, and release views were inspected with synthetic fixtures. Audience switching, Free-plan controls, privacy messaging, and private publication worked. Title wrapping was corrected and rechecked; mobile content had no horizontal overflow. The publish dialog was inspected before a small padding adjustment; automatic approval review blocked reopening the Retry delivery control, interpreting it as a possible send, so that action was not retried. These checks do not establish a deployed customer journey or Stripe lifecycle success.

## Live configuration and remaining release gates

- **GitHub webhook identity repaired:** production DB records CompIQ hook `595138372`. GitHub had that hook plus stale hook `594944149`, both targeting `https://api.shiplog.io/webhooks/github`. The stale hook's published events returned 401; the intended hook reached processing but exceeded GitHub's response deadline. On September 20 UTC, only stale hook `594944149` was disabled. After release, GitHub readback confirmed the intended hook remains active and the stale hook disabled, with unchanged secret/signature verification. No events were replayed and no recipients were notified. Fast acknowledgement is deployed; a safe signed live release event remains unverified.
- **Existing-account impact checked read-only:** five users, two connected repositories, no organizations. Both connected repositories belong to the existing Free account and have automation and a Slack/Discord channel enabled. Its Stripe subscription is active on an archived $0 price, which is not a reason to invent a paid-tier mapping. The Railway variable `GRANDFATHERED_REPO_IDS` was set without triggering a deployment and read back as `cmlbvyo6u0002u5t7h5nx0jji,cmlh4m8ek0007u5t7ic8jlo11` to preserve those configurations. The new deployed API must still be checked for effective access.
- **Stripe:** both expected price-variable names are populated; the current restricted live key cannot read those prices. The key can read checkout sessions and subscriptions, which the repaired billing safeguards require. The default portal enables cancellation and plan updates. Configured price amounts/products and test-mode lifecycle behavior remain unverified. No live charges were created. A dedicated Stripe test key, test prices, and webhook secret are needed; keep secrets in an ignored local environment file, never in this document or chat.
- **OAuth/config:** production API URL is `https://api.shiplog.io`, app URL is `https://shiplog.io`, and OAuth state-cookie domain is `.shiplog.io`. Canonical web traffic redirects to `www.shiplog.io`. Host-only session cookies and the cross-subdomain callback still need a real dedicated-account login test.
- **Railway:** released deployment `5af4dc82-a88b-4e4c-b562-8f25a3ff30bc` is SUCCESS at `3958684`. Its final resolved manifest uses the safe checked-in command without `--accept-data-loss`; startup logs report no schema changes. The in-progress manifest initially exposed the old platform fallback, so that fallback was also corrected. The prior deployment `f9d6db3a-279b-41ab-a94e-54d1df951f56` at `ca0e64d` is now REMOVED.
- **Vercel:** production deployment `6548972600` is successful at `3958684`; public domain checks and rendered inspection passed. CLI authentication remains unavailable and automatic approval review blocked dismissing an account-security prompt; no security setting was bypassed. GitHub deployment records provided the production revision and terminal outcome.
- **Dedicated live journey still required:** sign in → connect an approved test repository → import/receive a release → generate three drafts → edit → publish hosted-only → enable public access and inspect the changelog. A Slack/Discord send requires an explicitly approved test destination. Do not use private repository content for provider tests without authorization. Synthetic provider and local persistence tests are not substitutes.

## Prepared live verification sequence — pending access

Use a dedicated GitHub account and an approved repository containing only synthetic material. Suggested fixture: release `v0.0.1-readiness`, titled "Readiness fixture", with source changes "Add CSV export for completed tasks", "Fix duplicate project names after refresh", and "Allow Escape to close the settings dialog". Include no customer data or claims about performance, revenue, security, or migrations. Use this synthetic fixture for provider generation; private repository content requires separate authorization.

1. **Hosted-only activation:** sign in through the deployed web page and connect the fixture repository. Expect one connection, private visibility, automation off, and imported release metadata without an AI request. Explicitly generate and review three source-supported drafts, edit the customer draft, switch audiences, save, and reload. Publish with no channels. Anonymous list/detail requests must return 404 while private, show the saved content after visibility is enabled, and return 404 on the next fresh request after visibility is disabled again. Record desktop/mobile evidence and the release ID. New Free repositories must have automation/channels disabled; the existing owner should confirm effective grandfathered access on the two preserved repositories through read-only settings inspection.
2. **Signed event processing:** publish a synthetic GitHub release on the approved fixture repository with automation off; expect persistence and a prompt response without generation or delivery. This does not test asynchronous generation. Separately, use an approved paid test repository in an isolated test configuration, enable automatic generation, and leave automatic publication and channels disabled. Expect an authenticated 202, one persisted release, and eventual three-draft completion. A duplicate synthetic delivery should not create a second record or generation. Never replay an existing customer release.
3. **Billing and channel checks:** use a separate test database/configuration with Stripe test key, test price IDs, and test webhook secret; do not replace production billing credentials. Exercise checkout and trial activation, return to the app, duplicate-checkout prevention, plan changes, payment failure, cancellation, webhook retries, and access after downgrade. Separately obtain read-only access to verify the production prices match advertised amounts, currency, intervals, and products. Send a single clearly labeled fixture update only to an explicitly approved test destination and inspect delivery recording/retry behavior. Production remains free of test charges or recipient messages.

## Rollback and recovery

1. The deployed SHA and both platform deployment IDs are recorded above. For the next rollout, repeat independent review and required CI on the exact revision, and confirm remote main has not advanced before integration.
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

# ShipLog Roadmap (Post-MVP)

> Owner: Captain 🚢 (Product CEO)
> 
> Principle: keep the product **shippable weekly**. Each milestone ends in something customers can feel.

## Q1 Goals (Next 6–8 weeks)

### 1) Make ShipLog “set-and-forget” for teams
- Reliable auto-publish per channel (no accidental spam)
- Historical import so new customers see value on day 1
- Hosted changelog that can serve multiple audiences cleanly

### 2) Validate revenue + retention loops
- Confirm end-to-end Stripe billing + webhook provisioning is solid
- Add lightweight upgrade/downgrade/cancel UX
- Instrument key funnel events (connect repo → first release shipped → recipient engagement)

### 3) Reduce onboarding friction
- Opinionated defaults
- Clear preview of what will be posted + where
- Docs/templates so teams can standardize release notes

---

## Now (This Week) — Deliverables

### A) Toggle Auto-Release (Per Channel)
**Outcome:** each Slack/Discord/Email destination can be set to **auto-publish on release** or **manual only**.

**Deliverables**
- [x] DB: add `auto_publish BOOLEAN NOT NULL DEFAULT true` to `ProjectChannel` (or equivalent)
- [x] API: endpoints to update channel settings (PATCH channel)
- [x] UI: channel settings toggle + helper copy (what it does)
- [x] Publishing logic: respect `auto_publish=false` (store draft, do not send)
- [x] Auditability: log “suppressed publish due to channel setting”
- [x] Minimal test coverage: unit/integration around publish gating

**Acceptance criteria**
- Turning off auto-publish for a channel prevents messages from being sent, but still generates the changelog content.

### B) Stripe Billing Validation (Production)
**Outcome:** we can confidently accept payments without manual intervention.

**Deliverables**
- [x] Test live checkout for **Pro** and **Team** (happy path)
- [x] Confirm webhook receives: `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`
- [x] Provisioning: paid user receives correct plan entitlements
- [x] Failure modes: webhook retries don’t double-provision; idempotency keys in place
- [x] Admin visibility: a simple “Billing status” panel showing current plan + Stripe customer id

---

## Next (This Month) — Deliverables

### 1) Historical Import / Backfill
**Outcome:** when a repo is connected, ShipLog can backfill release notes from prior tags/releases.

**Deliverables**
- [ ] UX: “Import history” CTA shown after repo connect
- [ ] GitHub fetcher:
  - [ ] Option A: fetch Releases API (preferred)
  - [ ] Option B: fallback to tags if no releases
- [ ] Import controls:
  - [ ] Select range (last N, or date range)
  - [ ] Choose channels to publish vs “import only”
  - [ ] Deduplicate (don’t re-import already known tags)
- [ ] Job runner: async import with progress + resumability
- [ ] Result: imported releases appear in hosted page + internal UI

**Acceptance criteria**
- New customer connects repo → can import last 10 releases → immediately sees value in hosted page without waiting for a new release.

### 2) Hosted Page Enhancements (Audience Support)
**Outcome:** hosted changelog can present different “views” without hacks.

**Deliverables**
- [ ] Define audience model (v1):
  - [ ] `audience=public|internal|dev` on a release entry (or per rendered variant)
- [ ] Routing model (v1):
  - [ ] `/org/project` (public/customer default)
  - [ ] `/org/project/dev` (developer view)
  - [ ] `/org/project/internal` (stakeholder view; can be basic auth or login-gated later)
- [ ] UI polish:
  - [ ] Subscribe CTA (email) + RSS feed (nice leverage)
  - [ ] Canonical links + SEO basics

### 3) E2E Test Strategy Without “Real” GitHub
**Outcome:** CI can validate core flows deterministically.

**Deliverables**
- [ ] Mock GitHub OAuth + API (Playwright + MSW, or API-level mocks)
- [ ] Fixture repo responses (releases/tags/compare)
- [ ] Smoke test mode:
  - [ ] Optional: a dedicated “ShipLog Test” GitHub account + fixture repo for quarterly production smoke tests

---

## Later (Backlog / Stretch)
- Multi-repo projects (aggregate multiple repos into one changelog)
- Jira/Linear integration for “planned vs shipped” in stakeholder brief
- Templates + team-wide style guide (tone, verbosity, sections)
- Scheduled digests (weekly/monthly)

---

## Open Questions for the Board (2-minute decisions)
1) Backfill default: **import-only** (no posting) vs **post to selected channels**?
2) Hosted page: should every generated release auto-appear publicly, or require “Publish”?
3) Audience model: separate URLs (recommended) vs filters on a single page?

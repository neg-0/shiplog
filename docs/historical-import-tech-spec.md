# Tech Spec: Historical Import

## Goal
Allow new users to populate their ShipLog dashboard immediately by importing past releases from GitHub.

## User Story
As a user, after connecting a repository, I want to see my last 10 releases in the dashboard so that the page isn't empty and I can see how ShipLog would have formatted them.

## Technical Approach

### 1. GitHub API
We need to list releases for a repository.
`GET /repos/{owner}/{repo}/releases?per_page={limit}`

Response includes:
- `tag_name`
- `published_at`
- `body` (The existing release notes, if any)
- `draft`, `prerelease`

### 2. Import Logic
**Endpoint:** `POST /api/repos/:id/import`
**Body:** `{ limit: 10 }`

**Process:**
1. Fetch `limit` releases from GitHub.
2. For each release `R`:
   - Check if `Release` exists in DB (by `repoId` + `tagName`). If yes, skip.
   - If `R.body` exists and length > 50 chars:
     - Use existing body as the "Source of Truth".
     - **AI Task:** "Summarize this technical changelog for Stakeholders (Business) and Customers (Marketing)."
     - Do *not* regenerate the technical notes from commits (save tokens/time), unless the user explicitly asks for "Regenerate".
   - If `R.body` is empty or short:
     - **AI Task:** Full generation.
     - Fetch commits between `R.tag_name` and `previous_tag`.
     - Generate notes for all 3 audiences (Tech, Biz, Marketing).
3. Save to DB.
   - `Release` record.
   - `GeneratedNotes` record.
4. **Do NOT publish** to channels (Slack/Discord) during import.
   - This prevents spamming channels with old news.
   - Validated by: `channel.autoPublish` check or a specific `isImport` flag.

### 3. Database Changes
None required immediately. `Release` and `GeneratedNotes` tables support this.
We might need `isImported` boolean on `Release` for analytics, but `createdAt` vs `publishedAt` delta is a good proxy.

### 4. Edge Cases
- **Rate Limits:** Fetching 10 releases + generating AI for each might hit timeout (Vercel 10s limit on hobby, 60s on pro).
  - *Mitigation:*
    - Option A: Client-side iteration (fetch 1 by 1).
    - Option B: Background job (Inngest/bullmq) - overkill for MVP.
    - Option C: Just fetch metadata first, then "Hydrate" (generate notes) on demand or one-by-one in UI.
- **Missing Previous Tag:** The oldest release in the batch might not have a known "previous tag" to compare against if we don't fetch n+1.
  - *Fix:* Always fetch `limit + 1` from GitHub to ensure the last item has a base for comparison.

## Implementation Plan (MVP)
1. Add `listReleases` to `github.ts`.
2. Create `import.ts` service function that handles the logic (fetch -> loop -> generate/summarize -> save).
3. Create API route `POST /api/repos/:id/import`.
4. Add "Import" button in Repo Settings UI.

# ShipLog Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         GitHub                                   │
│  ┌──────────────┐                                               │
│  │   Release    │──webhook──┐                                   │
│  │   Published  │           │                                   │
│  └──────────────┘           ▼                                   │
└─────────────────────────────┼───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ShipLog API (Railway)                       │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Webhook    │───▶│   Generate   │───▶│  Distribute  │      │
│  │   Receiver   │    │   Pipeline   │    │   Pipeline   │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                   │                   │                │
│         │                   │                   ├──▶ Slack       │
│         │                   │                   ├──▶ Discord     │
│         │                   │                   ├──▶ Email       │
│         ▼                   ▼                   └──▶ Changelog   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    PostgreSQL                             │  │
│  │  - Users, Repos, Configs, Releases, Generated Notes      │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ API calls
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ShipLog Web (Vercel)                          │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Landing    │    │  Dashboard   │    │  Changelog   │      │
│  │   Page       │    │  (Config)    │    │  Pages       │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. API (Bun + Hono on Railway)

**Routes:**
- `POST /webhooks/github` — Receive GitHub release webhooks
- `GET /auth/github` — OAuth flow
- `GET /auth/github/callback` — OAuth callback
- `GET /api/repos` — List connected repos
- `POST /api/repos/:id/config` — Update repo config
- `GET /api/releases/:id` — Get release with generated notes
- `POST /api/releases/:id/regenerate` — Regenerate notes
- `POST /api/releases/:id/publish` — Manually publish

**Services:**
- `GitHubService` — Fetch PRs, commits, diffs between tags
- `GeneratorService` — LLM-based note generation (3 formats)
- `DistributorService` — Send to Slack, Discord, Email
- `ChangelogService` — Update hosted changelog data

### 2. Web (Next.js on Vercel)

**Pages:**
- `/` — Landing page
- `/login` — GitHub OAuth login
- `/dashboard` — Repo list, quick stats
- `/repos/:id` — Repo config (channels, emails, settings)
- `/repos/:id/releases` — Release history
- `/repos/:id/releases/:releaseId` — View/edit generated notes
- `/changelog/:org/:repo` — Public hosted changelog

### 3. Database (PostgreSQL on Railway)

**Tables:**
- `users` — GitHub users
- `repos` — Connected repositories
- `repo_configs` — Channel webhooks, email lists, settings
- `releases` — GitHub releases (synced)
- `generated_notes` — The 3 formats per release
- `distribution_logs` — Audit trail of what was sent where

## Data Flow

1. User publishes GitHub release
2. GitHub sends webhook to ShipLog API
3. API fetches PR/commit data between tags
4. GeneratorService calls LLM to create 3 formats
5. Notes saved to database
6. DistributorService sends to configured channels
7. Changelog page data updated
8. User can view/edit in dashboard

## Auth Flow

1. User clicks "Connect GitHub"
2. Redirect to GitHub OAuth
3. User authorizes ShipLog (repo read access)
4. Callback with code → exchange for token
5. Store token, create user session
6. User selects repos to connect
7. ShipLog creates webhooks on selected repos

## Environment Variables

### API
```
DATABASE_URL=postgresql://...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_WEBHOOK_SECRET=...
OPENAI_API_KEY=...
RESEND_API_KEY=...
JWT_SECRET=...
```

### Web
```
NEXT_PUBLIC_API_URL=https://api.shiplog.io
NEXT_PUBLIC_APP_URL=https://shiplog.io
```

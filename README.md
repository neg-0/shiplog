# ShipLog 🚢

> Release notes that ship themselves — tailored for customers, developers, and execs — from your GitHub releases.

## What is ShipLog?

ShipLog connects to your GitHub repository and automatically generates **three versions** of your release notes whenever you publish a release:

1. **Customer Changelog** — Feature-focused, benefit-driven, no jargon
2. **Developer Changelog** — Technical details, breaking changes, migration notes
3. **Stakeholder Brief** — Executive summary, shipped vs planned, impact

Then it **distributes them automatically** to:
- Slack / Discord channels
- Email digests
- Hosted changelog page at `shiplog.io/your-org`

## Project Structure

```
shiplog/
├── apps/
│   ├── web/          # Next.js frontend (Vercel)
│   └── api/          # Bun backend (Railway)
├── packages/
│   └── shared/       # Shared types and utilities
└── docs/             # Documentation
```

## Tech Stack

- **Frontend:** Next.js 14+ (App Router), TypeScript, Tailwind CSS
- **Backend:** Bun + Hono, TypeScript
- **Database:** PostgreSQL (Railway)
- **Auth:** GitHub OAuth
- **Hosting:** Vercel (frontend) + Railway (backend)

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development
pnpm dev
```

## Status

🟢 **MVP Live** (Beta) — [shiplog.io](https://shiplog.io)

## Key Features

- **Multi-Audience Generation:** Automatically creates Customer, Developer, and Stakeholder versions of every release.
- **Channel Control:** Configure auto-publishing per channel (Slack/Discord/Email) or review first.
- **Hosted Changelog:** Beautiful, SEO-friendly page for your users.
- **Zero Config:** Connects via GitHub OAuth in seconds.

## Environment Variables

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_TEAM=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## License

MIT

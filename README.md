# ShipLog

Release notes from GitHub, written for customers, developers, and stakeholders.

Connect a repository, import or receive a release, generate three drafts, review them, and publish a hosted changelog or send selected Slack/Discord updates.

- Web: Next.js 15, React 19, TypeScript, Tailwind; deployed on Vercel.
- API: Node.js, Hono, Prisma/PostgreSQL; deployed on Railway.
- Sign-in: GitHub OAuth. Billing: Stripe. Generation: OpenAI.

See [readiness review](docs/READINESS.md) for verified fixes, live rollout checks, and unfinished features. [Architecture](docs/ARCHITECTURE.md) and [roadmap](docs/ROADMAP.md) contain historical plans, not a current feature guarantee.

## Local development

Use Node.js 20+ and the package manager version in `package.json`:

```sh
corepack enable
corepack prepare pnpm@8.15.0 --activate
pnpm install --frozen-lockfile
pnpm --filter api db:generate
```

Copy `apps/api/.env.example` to `apps/api/.env` and configure a **local development** PostgreSQL database and provider test credentials. Never copy production credentials into a test fixture. Apply the schema to that local database with `pnpm --filter api db:push` before first use. The API process needs those values in its environment; for Node versions supporting `--env-file`, start it with:

```sh
cd apps/api
node --env-file=.env --import tsx src/index.ts
```

Start the frontend in another terminal:

```sh
pnpm --filter web dev
```

The frontend proxies `/api/*` to `http://127.0.0.1:3001` during development. Override `API_URL` for another development backend. Production defaults to `https://api.shiplog.io`.

## Validation

```sh
pnpm typecheck
pnpm test:api --runInBand --watchman=false
pnpm test:web --runInBand --watchman=false
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm audit --prod
```

Unit tests mock providers. Browser tests target a local API and verify public navigation, mobile layout, returning-visitor hydration, and the interactive example; they do not exercise live OAuth, generation, payment, or external delivery.

With PostgreSQL tools (`initdb`, `pg_ctl`, `createdb`) available on PATH, run the full API journey against a disposable local database:

```sh
node apps/api/scripts/test-local-journey.mjs
```

This exercises real authentication, cookies, persistence, importing, editing, publication, and privacy. GitHub and AI are simulated; unexpected provider requests fail the test. The runner creates and removes its own loopback database and does not load project environment files. CI runs the same check.

## Deployment configuration

The workspace uses `pnpm-lock.yaml`. Railway's API root is `apps/api`, so it uses its own checked-in `package-lock.json` with `npm ci`. When changing API dependencies, refresh both locks; generate the npm lock in a clean directory to avoid recording pnpm symlinks.

Stripe price variable names are `STRIPE_PRICE_PRO` and `STRIPE_PRICE_TEAM`. For production OAuth across web/API subdomains, set `COOKIE_DOMAIN=.shiplog.io`, `APP_URL` to the canonical web origin, and `API_URL` to the API origin. Authentication session cookies remain host-only.

Free includes one repository, manual generation/review, and a hosted changelog. Pro includes five repositories, automation, and Slack/Discord channels; Team includes unlimited repositories. `GRANDFATHERED_REPO_IDS` is an explicit compatibility list for repositories already using automation/channels before enforcement. Audit existing accounts before changing this list; it does not alter Stripe subscriptions or grant new Free repositories paid access.

The checked-in Railway command runs `prisma db push --skip-generate` before startup, without accepting data loss. There is no Prisma migration history yet. Review any schema drift before deploying; do not add a data-loss waiver to get a deployment through.

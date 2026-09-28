# ShipLog

Release notes from GitHub, written for customers, developers, and stakeholders.

Connect a repository, import or receive a release, generate three drafts, review them, and publish a hosted changelog or send selected Slack/Discord updates.

- Web: Next.js 15, React 19, TypeScript, Tailwind; deployed on Vercel.
- API: Node.js, Hono, Prisma/PostgreSQL; deployed on Railway.
- Sign-in: GitHub OAuth. Billing: Stripe. Generation: OpenAI.

See [readiness review](docs/READINESS.md) for verified fixes, live rollout checks, and unfinished features. [Architecture](docs/ARCHITECTURE.md) and [roadmap](docs/ROADMAP.md) contain historical plans, not a current feature guarantee.

## Local development

Use Node.js 20.6+ (for the `--env-file` command below) and the package manager version in `package.json`:

```sh
corepack enable
corepack prepare pnpm@8.15.0 --activate
pnpm install --frozen-lockfile
pnpm --filter api db:generate
```

### Environment variables

Environment files live beside each app. The checked-in examples list the variables read by the current code, with local defaults and blank credentials:

| App | Example | Local configuration |
| --- | --- | --- |
| API | [apps/api/.env.example](apps/api/.env.example) | `apps/api/.env` (explicitly loaded by the command below) |
| Web | [apps/web/.env.example](apps/web/.env.example) | `apps/web/.env.local` (loaded automatically by Next.js) |

Copy them without overwriting existing configuration:

```sh
cp -n apps/api/.env.example apps/api/.env
cp -n apps/web/.env.example apps/web/.env.local
```

For the core journey, fill in `DATABASE_URL`, `JWT_SECRET`, GitHub OAuth credentials, and `OPENAI_API_KEY` in the API file. Register `http://localhost:3001/auth/github/callback` as the development GitHub OAuth callback. The examples also document Stripe test-mode settings and optional feedback, email, admin, and maintenance features. The API example removes the unused global `GITHUB_WEBHOOK_SECRET`: secrets are generated separately for each connected repository.

Use a **local development** PostgreSQL database and provider test credentials. Both local filenames are git-ignored. Never copy production credentials into a test fixture or put secrets in `NEXT_PUBLIC_*` values, which are exposed to the browser.

After creating a local PostgreSQL database, check that `DATABASE_URL` points to `127.0.0.1`, then apply the schema with `pnpm --filter api db:push`. Prisma follows the configured URL, so check it again before later schema commands. If you keep an `initdb` cluster at `.local/postgres/data`, start or stop it from the repository root with `pg_ctl -D .local/postgres/data -l .local/postgres/server.log -w start` or `pg_ctl -D .local/postgres/data -m fast -w stop`. This directory is git-ignored.

Load configuration before the API modules initialize:

```sh
cd apps/api
node --env-file=.env --import tsx src/index.ts
```

If you keep isolated test overrides in `apps/api/.env.local`, load both files with `node --env-file=.env --env-file=.env.local --import tsx src/index.ts` from `apps/api`. The second file overrides the first; already-exported shell variables take precedence. Ensure the resulting `DATABASE_URL` points to the test database. The `pnpm --filter api dev` command has no explicit environment-file loader; use the command above for predictable loading before module initialization.

Start the frontend in another terminal:

```sh
pnpm --filter web dev
```

The frontend proxies `/api/*` to `http://127.0.0.1:3001` during development. Set `API_URL` in the web environment file for another backend. `NEXT_PUBLIC_API_URL=/api` makes the admin pages use that same proxy. Production defaults to `https://api.shiplog.io` when no API origin is configured. Restart local processes after changing environment files; deployed browser `NEXT_PUBLIC_*` values require a new build.

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

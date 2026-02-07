# ShipLog API Deployment

## Environment Variables

For Railway + Supabase:

- `DATABASE_URL`: Transaction pooler URL (port 6543)
- `DIRECT_URL`: Direct connection URL (port 5432) - REQUIRED for migrations
- `JWT_SECRET`: Random 32-char string
- `GITHUB_CLIENT_ID`: OAuth App ID
- `GITHUB_CLIENT_SECRET`: OAuth App Secret
- `STRIPE_SECRET_KEY`: Stripe secret key
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook signing secret

## Database Setup

This project uses Prisma with Supabase. Because Supabase uses connection pooling (PgBouncer) on port 6543, migrations and schema pushes must use the direct connection (port 5432).

1. Ensure `DIRECT_URL` is set in Railway variables.
2. The `schema.prisma` is configured to use `directUrl` for migrations.
3. The build command runs `npx prisma generate`.
4. The start command runs `npx prisma db push --skip-generate` to apply schema changes.

## Troubleshooting

- **"Relation public.users does not exist"**: This means migrations failed. Check if `DIRECT_URL` is set correctly and points to port 5432.

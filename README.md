# ANOTAI

ANOTAI is a Shopify embedded Remix app that gives Shopify founders a 5-agent AI revenue team for margin protection, cart recovery, customer intent capture, retention, and founder reporting.

## Current Focus

The current branch is focused on a paid beta MVP:

- Dashboard and demo data for customer walkthroughs.
- Margin Guardian COGS protection.
- Cart Sniper recovery flow with durable jobs and idempotency.
- Shopify Billing for the $999/month founder beta.
- Mandatory privacy pages and GDPR webhook routes.
- Owner controls: Approval, Auto, and Locked modes.

## Project Memory

Before asking any AI tool to modify this app, use the project memory files:

- `brain/project.md`: product goal, MVP scope, current status.
- `brain/architecture.md`: app structure, data ownership, reliability rules.
- `brain/tasks.md`: active and remaining work.
- `brain/decisions.md`: product, technical, and collaboration decisions.

Reusable prompts live in:

- `prompts/planner.md`
- `prompts/coder.md`
- `prompts/reviewer.md`
- `prompts/improver.md`

Rule: external tools can prototype or suggest ideas, but the real Shopify app must stay in this repository and pass verification before being trusted.

## Development

```shell
npm install
npx prisma generate
npx prisma db push
npm run dev
```

## Verification

```shell
npx tsc --noEmit
npm run lint
npm run build
```

Public smoke routes can be checked after a local server is running:

```shell
npm run smoke:public
```

## Supabase

Supabase SQL files live in `supabase/`. Apply the migrations in the real Supabase project before testing live data flows:

- `supabase/20260429_agent_controls_migration.sql`
- `supabase/20260429_agent_jobs_migration.sql`
- `supabase/20260429_customer_data_migration.sql`
- `supabase/20260430_cart_recovery_hardening.sql`

## Shopify Notes

- Local preview URLs from Cloudflare can expire; update `SHOPIFY_APP_URL` and `shopify.app.toml` when the tunnel changes.
- Public app review needs Shopify-native billing and privacy compliance webhooks.
- Protected customer data scopes/topics require Shopify approval before real cart/order recovery can run at production scale.


# ANOTAI Deployment Checklist

This file is the handoff checklist for making the ANOTAI Shopify app deploy-ready.

## Current Status
- Branch: `codex/agent-controls`
- Build: passing
- TypeScript: passing
- Prisma local sync: passing
- Local Shopify dev store browser test: passing
- Supabase demo seed: passing repeatedly
- MVP freeze notes: see `MVP_FREEZE.md`

## Required Accounts And Keys
- Shopify Partner app credentials:
  - `SHOPIFY_API_KEY`
  - `SHOPIFY_API_SECRET`
  - `SHOPIFY_APP_URL`
  - `SCOPES=read_products,write_discounts`
  - `SHOPIFY_BILLING_TEST=true` for dev stores, `false` for real production billing
- Supabase:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `JOB_RUNNER_SECRET`
- AI:
  - `GEMINI_API_KEY`
- Email, needed before real customer email sending:
  - `RESEND_API_KEY`
  - `SUPPORT_EMAIL`

## Supabase Setup
For a new Supabase project, run `supabase/schema.sql` in the Supabase SQL Editor before production testing.

Required tables:
- `stores`
- `products_cogs`
- `cart_events`
- `agent_actions`
- `agent_jobs`
- `customers`
- `customer_activities`
- `customer_intents`

Also run the latest migration files when updating an existing Supabase project:
- `supabase/20260429_agent_controls_migration.sql`
- `supabase/20260429_agent_jobs_migration.sql`
- `supabase/20260429_customer_data_migration.sql`
- `supabase/20260430_cart_recovery_hardening.sql`
- `supabase/20260430_mvp_apply_this_once.sql`

The current connected Supabase project has been verified with demo seed rows for products, carts, approvals, jobs, customers, activities, intents, and email events.

## Public Review URLs
These routes are available for beta trust links and later Shopify app review setup:
- `/privacy`
- `/terms`
- `/support`

## Customer Data Rules
ANOTAI stores customer data only as store-scoped commerce memory:
- `customers` stores minimal profile fields such as email, Shopify customer ID, marketing opt-in, and first/last seen timestamps.
- `customer_activities` stores commerce events such as search intent, abandoned cart, recovered cart, and agent email activity.
- Customer data is tied to `store_id`; one merchant's customer data must never be shared with another merchant.
- Do not store passwords, payment card data, unnecessary addresses, or private messages.
- Do not sell customer personal data. Use it only to power the merchant's agents, reports, and recovery workflows.

## Shopify Setup
The app config is in `shopify.app.toml`.

Configured scopes:
- `read_products`
- `write_discounts`

Configured webhook topics:
- `app/uninstalled`
- `app/scopes_update`
- `products/create`
- `products/update`

Configured privacy compliance topics:
- `customers/data_request`
- `customers/redact`
- `shop/redact`

These compliance topics are handled by `/webhooks/privacy` and must return `200 OK` for valid Shopify requests.

Protected customer data topics such as `orders/create` and `carts/update` require Shopify protected customer data approval before the app can subscribe to them. Keep them disabled for local/dev preview until approval is granted.

After changing the public app URL, update:
- `SHOPIFY_APP_URL` in the hosting environment
- `application_url` in `shopify.app.toml`
- `[auth].redirect_urls` in `shopify.app.toml`

Then deploy Shopify config with:

```bash
npm run deploy
```

## Hosting Notes
The Dockerfile is set up for Node 20 and production pruning.

Recommended production environment:
- Node.js 20+
- HTTPS public app URL
- Persistent session database
- Supabase for ANOTAI app data

Important: the current Prisma schema uses SQLite for Shopify sessions. SQLite is acceptable for local dev and simple single-instance testing, but production should use either:
- a persistent disk/volume for SQLite, or
- a hosted Postgres database with Prisma schema updated accordingly.

Prisma is configured with `engineType = "binary"` because this local machine runs Windows ARM64, where Prisma's default native Node-API library engine can fail to load. The binary engine also works for normal deployment targets.

## Autoscaling Architecture
ANOTAI should run like an elastic system:
- Shopify storefront traffic is served by Shopify, so merchant stores can handle normal storefront spikes without our app serving every storefront page.
- ANOTAI app servers must stay stateless. Any server instance should be replaceable because durable state lives in Prisma/Supabase.
- Webhooks and pixel events return fast and write slow work into `agent_jobs`.
- Background workers process `agent_jobs` separately from the web app. During traffic spikes, increase worker count; when traffic drops, reduce workers.
- Workers can be triggered by a scheduler calling `/api/jobs/run` every minute, or by a dedicated worker process that calls the same queue service.
- Production must set `JOB_RUNNER_SECRET`. Call `/api/jobs/run` with `Authorization: Bearer <JOB_RUNNER_SECRET>`.

Recommended production shape:
- Web app: 2+ autoscaling instances behind HTTPS.
- Worker: 1+ autoscaling workers for `agent_jobs`.
- Database: Supabase Postgres with connection pooling enabled.
- Email: real email provider with rate limits respected by owner safety settings.
- Monitoring: alert on failed jobs, webhook errors, high queue depth, and app 5xx errors.

## Verification Commands
Run these before any merge or deploy:

```bash
npm run lint
npx tsc --noEmit
npx prisma generate
npx prisma db push
npm audit --omit=dev
npm run build
```

## Manual Test Checklist
Before calling the app production-ready, manually test:
- Shopify install/login opens the embedded app.
- Dashboard loads without crashing.
- Demo data seed and clear work repeatedly.
- Supabase `stores` row is created after login.
- COGS page saves a product cost.
- Agents page saves owner mode controls.
- Settings page saves safety controls.
- Approval queue approve/block works.
- Pixel page generates copyable script.
- Billing page opens Shopify billing confirmation.
- Uninstall webhook removes Prisma sessions and Supabase store data.
- Privacy webhook handles `customers/data_request`, `customers/redact`, and `shop/redact`.
- Web pixel endpoint accepts a test event.
- Job runner processes a queued `agent_jobs` row.

## Smoke Test Result
- `npx tsc --noEmit` passes.
- `npm run build` passes.
- `/privacy`, `/terms`, and `/support` return HTTP 200 locally.
- Demo seed can run twice without duplicate job or customer FK errors.

## Current Known Gaps
- `RESEND_API_KEY` is missing, so emails run in dev/mock mode.
- Real billing requires `SHOPIFY_BILLING_TEST=false` in the production environment.
- Localhost/temporary tunnels are not permanent hosting.
- App review assets and screencast still need to be prepared before App Store submission.
- Autoscaling requires deploying web and worker processes to a real host; local Cloudflare dev tunnels are not permanent infrastructure.
- Protected customer data approval is needed before enabling real protected cart/order/customer topics.

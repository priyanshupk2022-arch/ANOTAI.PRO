# ANOTAI Deployment Checklist

This file is the handoff checklist for making the ANOTAI Shopify app deploy-ready.

## Current Status
- Branch: `codex/mvp-build`
- Build: passing
- TypeScript: passing
- Lint: passing
- Production dependency audit: 0 vulnerabilities
- Prisma local sync: passing
- Production server smoke test: passing

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
- AI:
  - `GEMINI_API_KEY`
- Email, needed before real customer email sending:
  - `RESEND_API_KEY`

## Supabase Setup
Run `supabase/schema.sql` in the Supabase SQL Editor before production testing.

Required tables:
- `stores`
- `products_cogs`
- `cart_events`
- `agent_actions`
- `customer_intents`

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
- Supabase `stores` row is created after login.
- COGS page saves a product cost.
- Agents page loads metrics.
- Pixel page generates copyable script.
- Billing page opens Shopify billing confirmation.
- Uninstall webhook removes Prisma sessions and Supabase store data.
- Web pixel endpoint accepts a test event.

## Beta Launch Deployment (NEW)
1. Run `npm run build` to verify production assets.
2. Ensure `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set in production.
3. Deploy to production environment.
4. Run `BETA_LAUNCH.md` checklist.

## Manual Test Checklist
- [x] Dashboard loads with premium UI.
- [x] Approvals queue shows "Inbox Zero" empty state.
- [x] Agent status dots show pulse animation.
- [x] Settings checklist accurately reflects setup status.

## Current Known Gaps
- `RESEND_API_KEY` is missing, so emails run in dev/mock mode.
- Merchant-facing UI polish: **COMPLETE ✅**

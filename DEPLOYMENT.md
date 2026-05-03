<<<<<<< HEAD
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
=======
# ANOTAI — Production Deployment Guide
**Phase 9 | Updated after Launch Hardening**

> ⚠️ **READ BEFORE DEPLOYING:** The `shopify.app.toml` previously used a Cloudflare Tunnel URL (temp dev URL) and insufficient scopes. This has been corrected. Run `npx shopify app deploy` to push updated config to Shopify Partner Dashboard.

---

## 1. Pre-Deployment Checklist

### 1.1 Environment Variables (All Required)

#### Shopify
| Variable | Value / Source |
|---|---|
| `SHOPIFY_API_KEY` | Shopify Partner Dashboard → App → API Credentials |
| `SHOPIFY_API_SECRET` | Same location — used for HMAC webhook verification |
| `SCOPES` | `read_products,write_products,read_orders,write_orders,read_customers,write_customers,read_draft_orders,write_draft_orders,read_analytics,write_checkouts,read_inventory,write_inventory,write_discounts` |
| `SHOPIFY_APP_URL` | Your production HTTPS URL (e.g. `https://anotai.fly.dev`) |

#### Supabase
| Variable | Notes |
|---|---|
| `SUPABASE_URL` | `https://your-project.supabase.co` |
| `SUPABASE_ANON_KEY` | Safe for server use — do not expose in frontend bundles |
| `SUPABASE_SERVICE_ROLE_KEY` | **SERVER ONLY** — never expose to client |

#### AI
| Variable | Notes |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio → API Keys |

#### Email (Resend)
| Variable | Notes |
|---|---|
| `RESEND_API_KEY` | resend.com → API Keys |
| `RESEND_FROM_EMAIL` | Must be a verified domain on Resend (e.g. `agents@anotai.app`) |

#### Admin / Security
| Variable | Notes |
|---|---|
| `ADMIN_DEBUG_TOKEN` | Long random string — protects `/internal/debug` page |

#### Feature Flags
| Variable | Default | Notes |
|---|---|---|
| `HIERARCHICAL_ORCHESTRATOR_ENABLED` | `false` | Set `true` to enable War Room mode |

#### Global Kill Switches
| Variable | Default | Effect when `true` |
|---|---|---|
| `KILL_SWITCH_AUTO_EXECUTION` | `false` | Blocks ALL action auto-execution across all stores |
| `KILL_SWITCH_RECOVERY_EMAILS` | `false` | Blocks ALL recovery email sends |
| `KILL_SWITCH_WAR_ROOM` | `false` | Disables War Room hierarchical workflows |
| `KILL_SWITCH_TEMPLATE_MODE` | `false` | Forces template-only AI replies (no LLM dynamic replies) |
| `KILL_SWITCH_CUSTOMER_AI_REPLIES` | `false` | Disables all customer-facing AI messages |

> ✅ Kill switches read from env at runtime — changing them takes effect immediately without a redeploy.

---

## 2. Database Migrations (Run In Order)

Run all SQL files in the Supabase SQL Editor **in this exact order**:

```
1. supabase/schema.sql                    ← Base schema (run once on a fresh DB)
2. supabase/00_phase2_upgrade.sql         ← Action queue, workflows, agents
3. supabase/01_phase2_hierarchy_upgrade.sql ← Agent hierarchy (parent_id, levels)
4. supabase/02_phase3_seed_hierarchy.sql  ← Seed default agent records
5. supabase/03_phase8_hardening.sql       ← Kill switch columns, error_logs, processed_webhooks
```

### Migration Safety Audit ✅
All migrations are **purely additive**:
- All `ALTER TABLE` use `ADD COLUMN IF NOT EXISTS` — safe to run multiple times
- All `CREATE TABLE` use `IF NOT EXISTS` — safe to run on existing databases
- No `DROP`, `TRUNCATE`, `DELETE`, or `ALTER COLUMN TYPE` commands
- RLS enabled on `error_logs` (store-scoped)
- `processed_webhooks` table has `UNIQUE` on `shopify_event_id` for idempotency
- `merchant_agent_settings.auto_discount_replies_enabled` defaults to `FALSE` — safe default

---

## 3. Shopify Partner Dashboard Setup

### 3.1 Update App Configuration
After deploy, run:
```bash
npx shopify app deploy
```
This pushes `shopify.app.toml` changes to Shopify (scopes, webhook subscriptions, redirect URLs).

### 3.2 Required Scopes (Updated from Phase 9)
The `shopify.app.toml` previously had only `read_products,write_discounts`.

**Now correctly set to:**
```
read_products, write_products, read_orders, write_orders, 
read_customers, write_customers, read_draft_orders, write_draft_orders,
read_analytics, write_checkouts, read_inventory, write_inventory, write_discounts
```

> ⚠️ **Protected customer data scopes** (`read_orders`, `read_customers`, `write_checkouts`) require Shopify Protected Customer Data approval for App Store listings. For private/beta installs this is not required.

### 3.3 Required Webhook Subscriptions
These are now registered in `shopify.app.toml`:
- `carts/update` → `/webhooks` ✅ (was **MISSING** before Phase 9)
- `orders/create` → `/webhooks` ✅ (was **MISSING** before Phase 9)
- `products/create` → `/webhooks` ✅
- `products/update` → `/webhooks` ✅
- `app/uninstalled` → `/webhooks` ✅
- GDPR: `customers/redact`, `customers/data_request`, `shop/redact` ✅

### 3.4 URLs to Update
Replace `your-app.fly.dev` with your real production domain in:
1. `shopify.app.toml` → `application_url` and `[auth].redirect_urls`
2. `SHOPIFY_APP_URL` env var in your hosting platform

---

## 4. Hosting Deployment (Fly.io / Railway / Render)

```bash
# Install
npm install

# Build
npm run build

# Start (production)
node build/server/index.js

# Or if using Dockerfile
docker build -t anotai .
docker run -p 3000:3000 --env-file .env anotai
```

> ⚠️ The app uses **SQLite (Prisma)** for Shopify session storage. For multi-instance production hosting, mount a persistent disk or migrate to Postgres session storage.

---

## 5. Dev Store QA Flow

Test this exact sequence on **1 Shopify dev store** before inviting beta merchants:

### Install & Auth
- [ ] App installs on dev store via Shopify Partner Dashboard
- [ ] Embedded dashboard loads without JS errors
- [ ] Supabase `stores` row is created after auth

### Onboarding
- [ ] Onboarding playbook page opens and completes
- [ ] `merchant_agent_settings` row created in Supabase
- [ ] All new Phase 8 safety columns have correct defaults

### Theme Extension
- [ ] Theme app extension enabled on dev store theme
- [ ] Chat widget visible on storefront
- [ ] Widget sends a product question and gets AI response

### Margin Guardian
- [ ] Type discount request in chat
- [ ] Margin Guardian blocks unsafe discount
- [ ] Safe alternative drafted in Action Queue

### Cart Recovery Flow
- [ ] Add items to cart and abandon it
- [ ] `carts/update` webhook fires (check Shopify webhook logs)
- [ ] Action Queue shows pending recovery action
- [ ] Approve action → email logged in console (dev mode) or sent via Resend

### Dashboard Verification
- [ ] Value Activity dashboard shows real counts (not all zeros)
- [ ] Opportunity Pipeline shows detected cart value
- [ ] AI Team org chart loads all agents
- [ ] Usage page shows correct plan and interaction counts

### Kill Switch Test
- [ ] Set `KILL_SWITCH_RECOVERY_EMAILS=true` → approve a recovery action → email is **blocked**
- [ ] Set `KILL_SWITCH_AUTO_EXECUTION=true` → approve action → status becomes **failed** with kill switch message
- [ ] Reset both to `false` → confirm normal operation resumes

### Admin Debug Page
- [ ] Visit `/internal/debug?token=YOUR_TOKEN`
- [ ] Kill switch status shows correctly
- [ ] Visit with wrong token → 403 Forbidden

### Error Logging
- [ ] Check Supabase `error_logs` table after kill switch tests — rows should be inserted

---

## 6. Store Isolation Smoke Test

In Supabase, verify:
```sql
-- Store A should NOT see Store B's actions
SELECT * FROM action_queue WHERE store_id = 'store_a_uuid';
-- Should return only Store A records

SELECT * FROM error_logs WHERE store_id = 'store_a_uuid';
-- Should return only Store A errors
```

All queries in `metrics.server.ts`, `actionQueue.server.ts`, `agentRegistry.server.ts` are scoped by `store_id`. ✅

---

## 7. Readiness Classification

| Category | Status | Notes |
|---|---|---|
| Build | ✅ Exit 0 | All phases |
| DB Migrations | ✅ Additive | Run in Supabase SQL editor |
| Kill Switches | ✅ Implemented | Env + store-level |
| Error Logging | ✅ Implemented | `error_logs` table |
| Webhook Idempotency | ✅ Implemented | `processed_webhooks` table |
| Email Safety | ✅ Hardened | 4-layer guard |
| `shopify.app.toml` | ⚠️ URL needs update | Replace placeholder URL |
| Scopes | ✅ Fixed | Was too narrow before Phase 9 |
| Cart/Order Webhooks | ✅ Fixed | Were missing from toml before Phase 9 |
| SQLite Session Storage | ⚠️ Risk | OK for single-instance; needs persistent disk |
| Beta Readiness | 🟡 **DEV STORE READY** | Run dev store QA → then PRIVATE BETA READY |

---

## 8. Remaining Blockers Before Private Beta

1. **Update `shopify.app.toml` URL** — replace `your-app.fly.dev` with real domain, run `npx shopify app deploy`
2. **Run all 5 SQL migrations** in production Supabase
3. **Set `ADMIN_DEBUG_TOKEN`** in your hosting environment
4. **Complete dev store QA checklist above** (all boxes checked)
5. **Verify `RESEND_API_KEY`** is set and sender domain verified in Resend (optional for dev store, required for beta)
>>>>>>> origin/main

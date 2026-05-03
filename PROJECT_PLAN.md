# ANOTAI MVP Plan

## Product
ANOTAI is a Shopify embedded Remix app that gives solo Shopify founders a 5-person AI revenue team. It combines a merchant dashboard, COGS/margin protection, abandoned-cart recovery, AOV lift, customer retention, billing gates, and agent activity tracking.

## Starter Offer
- Price: `$999/month`.
- Positioning: hire a 5-person AI revenue team without hiring employees.
- First release agents: Margin Guardian, Cart Sniper, AI Personal Shopper, Retention Engine, and Revenue Analyst.
- Default safety mode: approval required before risky actions such as discounts, margin-sensitive recovery offers, or automated campaigns go live.

<<<<<<< HEAD
## Owner Control System
- Worktree branch: `codex/agent-controls`.
- Agent modes: `Approval`, `Auto`, and `Locked`.
- Default modes: Margin Guardian and Revenue Analyst use Auto; revenue-changing agents start in Approval.
- Global safety settings live in `stores.settings`: minimum margin floor, max discount, daily email limit, auto revenue impact limit, and approval threshold.
- Cart Sniper and Retention Engine now check owner controls before executing risky actions.
- Approval Queue page lets the owner approve or block pending agent actions.
- Dashboard shows a pending approval banner when risky actions need review.
- Onboarding page shows beta readiness, pilot limits, and setup checklist.
- Revenue Analyst generates a founder report with wins, risks, and next actions on the Analytics page.
- Supabase migration `supabase/20260429_agent_controls_migration.sql` updates existing databases for settings and 5-agent actions.
- Supabase migration `supabase/20260429_agent_jobs_migration.sql` adds the queue table used for scalable background work.
- Supabase migration `supabase/20260429_customer_data_migration.sql` adds minimal customer profiles and commerce activity tracking.

## Current Architecture
- Shopify auth and embedded app sessions use `@shopify/shopify-app-remix` with Prisma session storage.
- Prisma currently owns only the Shopify `Session` model and writes to local SQLite at `prisma/dev.sqlite`.
- Supabase owns ANOTAI business data: stores, COGS, cart events, agent actions, agent jobs, and customer intents.
- Customer memory is store-scoped through `customers` and `customer_activities`, so each merchant only sees their own customer activity.
- Server-side Supabase access uses `SUPABASE_SERVICE_ROLE_KEY`.
- Browser realtime access uses the public `SUPABASE_ANON_KEY`.
- Webhooks and storefront pixel events enqueue slow work into `agent_jobs` so the web app can respond quickly during traffic spikes.
- Background workers process queued jobs separately from the web app. This is the scaling foundation for the "balloon" model: add workers when traffic grows, reduce workers when traffic drops.
=======
## Current Architecture
- Shopify auth and embedded app sessions use `@shopify/shopify-app-remix` with Prisma session storage.
- Prisma currently owns only the Shopify `Session` model and writes to local SQLite at `prisma/dev.sqlite`.
- Supabase owns ANOTAI business data: stores, COGS, cart events, agent actions, and customer intents.
- Server-side Supabase access uses `SUPABASE_SERVICE_ROLE_KEY`.
- Browser realtime access uses the public `SUPABASE_ANON_KEY`.
>>>>>>> origin/main

## Completed
- Production build passes.
- Prisma client generation and `prisma db push` pass.
- Dev preview startup now avoids duplicate Prisma generation during Remix startup, reducing Windows ARM file-lock failures.
- Current Shopify dev preview URL is `https://cultures-summer-tags-circle.trycloudflare.com`.
- Public login page now uses ANOTAI positioning instead of the default Shopify template.
- Agents page now presents the 5-agent starter team and explains each agent's job.
- Billing page now presents the `$999/month` starter plan and 7-day trial.
- Dashboard no longer imports server-only Supabase code into the browser bundle.
- Shopify `afterAuth` now syncs installed shops into Supabase `stores`.
- App uninstall webhook now removes both Prisma sessions and Supabase store data.
- Web pixel intent capture now includes the shop domain explicitly and returns CORS headers.
<<<<<<< HEAD
- Web pixel intent capture now queues intent work instead of doing slow agent work inside the storefront request.
- Shopify webhooks now queue cart/order/product work instead of running slow agent actions inside the webhook response.
- `/api/jobs/run` processes queued jobs and is protected by `JOB_RUNNER_SECRET` in production.
- Retention Engine and Cart Sniper now write customer profile/activity memory for future personalization and reporting.
- Public privacy, terms, and support pages are available for beta trust/review links.
- `BETA_LAUNCH.md` defines the first 10 paid pilot offer, demo flow, and limits.
- Shopify app config now declares the app scopes and webhook topics needed by the MVP.
- Shopify app config now declares mandatory privacy compliance webhooks for `customers/data_request`, `customers/redact`, and `shop/redact`.
- Privacy webhook handling now verifies Shopify HMAC before processing compliance requests.
- Customer redaction now removes store-scoped customer profiles, customer activity, customer intent, and cart event data tied to the requested customer.
- Shop redaction now removes Shopify sessions and Supabase store data.
=======
- Shopify app config now declares the app scopes and webhook topics needed by the MVP.
>>>>>>> origin/main
- Dev preview uses non-protected Shopify scopes/topics only. `read_orders`, `read_checkouts`, `orders/create`, and `carts/update` require protected customer data approval before enabling.

## Backend/Core Work Remaining
- Verify Supabase SQL schema is applied in the actual Supabase project.
<<<<<<< HEAD
- Run `supabase/20260429_agent_controls_migration.sql` in the actual Supabase project before testing owner controls on live data.
- Run `supabase/20260429_agent_jobs_migration.sql` in the actual Supabase project before testing webhook/pixel queues.
- Run `supabase/20260429_customer_data_migration.sql` in the actual Supabase project before testing customer memory.
- Replace placeholder email sending with a real email provider before production.
=======
- Replace placeholder email sending with a real email provider before production.
- Decide whether cart/order/product webhooks should remain on the combined `/webhooks` route or move to dedicated authenticated Shopify webhook routes.
>>>>>>> origin/main
- Apply for Shopify protected customer data access before enabling real cart/order recovery webhooks.
- Harden billing lifecycle handling for cancellation, frozen charges, and plan downgrade states.
- Add server-side validation around CSV import and numeric money fields.
- Add logging/monitoring for webhook and agent failures.
<<<<<<< HEAD
- Add a reviewer-friendly onboarding gate so install, billing, and setup never land on a blank screen.
=======
>>>>>>> origin/main

## UI Work Remaining
- Improve dashboard visual density and responsive polish after core flows are stable.
- Ensure all pages are responsive inside Shopify Admin.
- Use Remix `Link`/forms consistently for embedded navigation.

## Current Dev Preview Blocker
- Shopify Admin blank/error is currently caused by the temporary Cloudflare tunnel URL expiring or losing DNS when the dev server, laptop, or hotspot restarts.
- This is not a production code architecture blocker. Permanent fix is stable hosting or a fixed tunnel/domain.
- Until deployment, restart the Shopify dev preview whenever the tunnel URL dies and make sure `SHOPIFY_APP_URL` and `shopify.app.toml` match the new URL.

## Safe Collaboration Rules
- Keep backend/core ownership with Codex.
- Give UI-only route and CSS work to Antigravity if using it later.
- Do not let two agents edit the same route or shared CSS file at the same time.
- Run `npm run build` after every major change.

## Next Verification
- `npx prisma generate`
- `npx prisma db push`
- `npm run build`

## Branch Readiness - 2026-04-28
- Working branch: `codex/mvp-build`.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npx prisma generate`: passed.
- `npx prisma db push`: passed.
- `npm run build`: passed.
- Live dev preview root returns HTTP 200.
- Embedded app route redirects correctly to Shopify session-token handling for browser user agents.
- Auth no longer waits for Supabase store sync in `afterAuth`, so slow database sync should not block Shopify auth completion.
- COGS, Pixel, Settings, and Analytics pages now use cleaner MVP copy and safer fallbacks.
<<<<<<< HEAD
- Agent profiles define each agent's mission, inputs, outputs, auto-safe work, and approval-required work.
- Agents page includes owner mode controls for all 5 agents.
- Settings page includes global safety controls for autonomy limits.
- Approvals page is wired into Shopify app navigation and every ANOTAI sidebar.
- Analytics page now includes a Revenue Analyst report instead of only raw metrics.
- Non-blocking warning remains from CSS minification inside bundled styles: `@media (--p-breakpoints-md-up) and print`. It does not fail the build.
- Do not merge to `main` until the merchant-facing flows are manually checked in the browser: install/login, dashboard load, COGS save, billing redirect, pixel script copy, privacy webhooks, and uninstall webhook cleanup.
=======
- Non-blocking warning remains from CSS minification inside bundled styles: `@media (--p-breakpoints-md-up) and print`. It does not fail the build.
- Do not merge to `main` until the merchant-facing flows are manually checked in the browser: install/login, dashboard load, COGS save, billing redirect, pixel script copy, and uninstall webhook cleanup.
>>>>>>> origin/main

# ANOTAI MVP Plan

## Product
ANOTAI is a Shopify embedded Remix app that gives solo Shopify founders a 5-person AI revenue team. It combines a merchant dashboard, COGS/margin protection, abandoned-cart recovery, AOV lift, customer retention, billing gates, and agent activity tracking.

## Starter Offer
- Price: `$999/month`.
- Positioning: hire a 5-person AI revenue team without hiring employees.
- First release agents: Margin Guardian, Cart Sniper, AI Personal Shopper, Retention Engine, and Revenue Analyst.
- Default safety mode: approval required before risky actions such as discounts, margin-sensitive recovery offers, or automated campaigns go live.

## Current Architecture
- Shopify auth and embedded app sessions use `@shopify/shopify-app-remix` with Prisma session storage.
- Prisma currently owns only the Shopify `Session` model and writes to local SQLite at `prisma/dev.sqlite`.
- Supabase owns ANOTAI business data: stores, COGS, cart events, agent actions, and customer intents.
- Server-side Supabase access uses `SUPABASE_SERVICE_ROLE_KEY`.
- Browser realtime access uses the public `SUPABASE_ANON_KEY`.

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
- Shopify app config now declares the app scopes and webhook topics needed by the MVP.
- Dev preview uses non-protected Shopify scopes/topics only. `read_orders`, `read_checkouts`, `orders/create`, and `carts/update` require protected customer data approval before enabling.

## Backend/Core Work Remaining
- Verify Supabase SQL schema is applied in the actual Supabase project.
- Replace placeholder email sending with a real email provider before production.
- Decide whether cart/order/product webhooks should remain on the combined `/webhooks` route or move to dedicated authenticated Shopify webhook routes.
- Apply for Shopify protected customer data access before enabling real cart/order recovery webhooks.
- Harden billing lifecycle handling for cancellation, frozen charges, and plan downgrade states.
- Add server-side validation around CSV import and numeric money fields.
- Add logging/monitoring for webhook and agent failures.

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
- Non-blocking warning remains from CSS minification inside bundled styles: `@media (--p-breakpoints-md-up) and print`. It does not fail the build.
- Do not merge to `main` until the merchant-facing flows are manually checked in the browser: install/login, dashboard load, COGS save, billing redirect, pixel script copy, and uninstall webhook cleanup.

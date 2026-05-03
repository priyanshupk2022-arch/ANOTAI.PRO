# ANOTAI MVP Freeze

## Freeze Status
Date: 2026-04-30

The local/dev beta MVP is frozen as demo-ready after the current verification pass.

## Included In MVP
- Shopify embedded app shell.
- Dashboard with revenue impact, activity feed, customer signals, worker health, and launch checklist.
- Demo data seed/clear flow.
- COGS manager for Margin Guardian.
- Five agent profiles and owner mode controls.
- Global safety settings.
- Approval queue.
- Billing page using Shopify-native billing flow.
- Onboarding readiness checklist.
- Pixel setup page.
- Analytics / Revenue Analyst page.
- Privacy, terms, and support pages.
- Mandatory privacy webhook route.
- App uninstall webhook route.
- Job queue endpoint for background processing.

## Verified
- Browser/manual: dashboard, sample data, COGS, approvals, agents/settings, and billing page work in the Shopify dev store.
- Database: demo seed was run twice against Supabase without duplicate job or customer relation failures.
- TypeScript: `npx tsc --noEmit` passes.
- Production build: `npm run build` passes.
- Public trust pages: `/privacy`, `/terms`, and `/support` return HTTP 200 locally.
- Privacy webhook: signed `customers/data_request` smoke request returns HTTP 200 locally.

## Non-Blocking Warnings
- Shopify Polaris CSS produces an esbuild warning around `@media (--p-breakpoints-md-up) and print`.
- Vite reports a mixed static/dynamic import warning for `job-queue.server.ts`.
- These warnings do not block build output or app execution.

## Not Frozen For Production
Do not call the app fully production-launched until these are complete:

- Stable hosting/domain replaces local tunnel/localhost.
- Production environment variables are configured.
- Resend or another verified email provider is connected.
- Shopify live billing is tested outside dev mode.
- Protected customer data approval is granted if needed.
- Monitoring/logging is configured.
- Shopify app review assets are prepared.

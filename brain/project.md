# ANOTAI Project Memory

## Goal
Build ANOTAI: a Shopify embedded Remix SaaS app that gives lean Shopify founders a 5-agent AI revenue team.

## Product Positioning
ANOTAI sells outcomes, not tools:
- Protect profit margins before discounts go live.
- Recover abandoned carts without killing margin.
- Capture customer intent signals for retention.
- Give founders a clear revenue command center.
- Keep risky AI actions owner-approved by default.

## Target Customer
US Shopify merchants with enough revenue pain to pay for a high-value beta.

## Starter Offer
- Founder beta: $999/month.
- 7-day trial through Shopify Billing.
- First 10 stores only.
- Approval-first mode for customer-facing emails, discounts, and campaigns.

## MVP Scope
The MVP must be stable enough for a paid beta demo:
- Shopify install/auth works.
- Dashboard loads without blank screen.
- COGS can be added/imported.
- Margin Guardian blocks unsafe discounts.
- Cart Sniper uses database jobs, idempotency, Shopify discounts, and email dedupe.
- Demo data makes the app look alive.
- Agents, settings, approvals, onboarding, analytics, billing, pixel, privacy, terms, and support pages exist.
- Production build passes.

## Non-Goals For MVP
- Fully autonomous dangerous actions.
- Unlimited AI usage.
- Public Shopify App Store approval guarantees.
- Enterprise SLA.
- Selling customer data.
- Replacing all ecommerce tools on day one.

## Current Status
Customer-demo beta MVP is locally demo-ready. Browser/manual checks passed for dashboard, demo data, COGS, approvals, agents/settings, and billing page in the Shopify dev store. TypeScript and production build pass. Demo data was verified against Supabase twice in a row without duplicate job or customer relation failures.

The next phase is hosted beta readiness: stable HTTPS hosting, production environment variables, real email provider setup, Shopify live billing verification, and app review assets.

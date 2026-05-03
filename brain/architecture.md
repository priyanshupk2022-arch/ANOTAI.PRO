# ANOTAI Architecture Memory

## Framework
- Remix Shopify embedded app.
- Shopify App Bridge for embedded admin navigation.
- Prisma stores Shopify app sessions in local SQLite for development.
- Supabase stores ANOTAI product/business data.

## Main Folders
- `app/routes/`: Remix pages, public pages, API routes, Shopify webhooks.
- `app/agents/`: AI agent domain logic.
- `app/services/`: backend services for billing, jobs, privacy, customer memory, email, Shopify discounts.
- `app/components/`: shared UI components.
- `app/styles/`: ANOTAI dashboard styling.
- `prisma/`: Shopify session schema.
- `supabase/`: SQL schema and migrations for ANOTAI data.
- `brain/`: project memory for future AI work.
- `prompts/`: reusable execution prompts for AI-assisted development.

## Core Data Ownership
- Prisma owns Shopify session storage only.
- Supabase owns stores, COGS, cart events, agent actions, agent jobs, customer profiles, customer activities, customer intents, and email events.

## Core Agents
- Margin Guardian: validates every discount against COGS and margin floor.
- Cart Sniper: detects abandoned carts, schedules recovery jobs, creates safe discounts, sends one recovery email per cart.
- AI Personal Shopper: bundle/AOV assistant, approval-first for MVP.
- Retention Engine: customer intent capture and VIP drop logic, approval-first for MVP.
- Revenue Analyst: founder report and risk/win summary.

## Reliability Rules
- Never use in-memory timers for delayed customer-facing actions.
- Use `agent_jobs` for scheduled/background work.
- Every retry-prone flow needs idempotency.
- Do not send email until Shopify discount creation succeeds.
- One cart should receive at most one cart recovery email.
- Missing COGS means discount blocked, not guessed.
- Webhooks must verify Shopify HMAC and return fast.

## Shopify Requirements
- Use Shopify native Billing API for public app/payment review.
- Mandatory privacy webhooks must exist and return 200 after valid HMAC:
  - `customers/data_request`
  - `customers/redact`
  - `shop/redact`
- Do not enable protected data scopes until Shopify grants approval.

## Deployment Shape
- Web app can run on Vercel/Render/Node host.
- Supabase is the database.
- A job runner must call `/api/jobs/run` with `JOB_RUNNER_SECRET`.
- Email provider is optional in zero-cost demo mode; production should use Resend or equivalent.


# ANOTAI Agent Instructions

## Source Of Truth
Before substantial work, read:
- `brain/project.md`
- `brain/architecture.md`
- `brain/tasks.md`
- `brain/decisions.md`

Keep these files updated when project scope, status, tasks, or decisions change.

## Product Goal
ANOTAI is a Shopify embedded Remix app for a paid founder beta. It gives Shopify merchants a 5-agent AI revenue team: Margin Guardian, Cart Sniper, AI Personal Shopper, Retention Engine, and Revenue Analyst.

## Working Rules
- Preserve the existing Shopify Remix app. Do not replace it with a new scaffold.
- Keep risky actions approval-first by default.
- Never sell or misuse customer data.
- External tools like Manus can provide reference ideas only; final production changes must be adapted into this repo and verified.
- Avoid unrelated refactors while finishing MVP.
- Use Remix `Link` and `Form` inside embedded app routes for internal navigation/actions.

## Reliability Rules
- Do not use in-memory timers for delayed customer-facing actions.
- Use `agent_jobs` for scheduled/background work.
- Add idempotency for webhook, job, discount, and email flows.
- Do not send recovery email until Shopify discount creation succeeds.
- One cart should receive at most one recovery email.
- Missing COGS blocks discounts.
- Webhooks must verify Shopify HMAC and respond fast.

## Verification
After significant changes, run:
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

When public routes matter, run `npm run smoke:public` with a local server.

## MVP Definition
Customer-demo beta MVP means:
- Dashboard loads.
- Demo data can seed/clear.
- COGS can save/import.
- Agent modes can save.
- Safety settings can save.
- Approvals can approve/block.
- Billing page starts Shopify Billing test flow.
- Pixel setup page shows copyable script.
- Privacy, terms, support, and GDPR webhook routes exist.
- Build passes.


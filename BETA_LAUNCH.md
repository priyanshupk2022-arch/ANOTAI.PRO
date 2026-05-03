# ANOTAI Beta Launch Handoff

## Current State
ANOTAI is ready as a local/dev beta MVP for customer demos.

- Shopify embedded app opens in the dev store.
- Dashboard, demo data, COGS, approvals, agents, settings, billing, onboarding, pixel, analytics, privacy, terms, and support pages are present.
- Demo data has been verified against Supabase and can be run repeatedly without duplicate job/customer crashes.
- `npx tsc --noEmit` passes.
- `npm run build` passes.
- Remaining build warnings are non-blocking dependency/chunk warnings.

## Founder Beta Offer
- Price: `$999/month`.
- Audience: US Shopify founders/operators with enough revenue pain to pay for automation.
- Positioning: a 5-agent AI revenue team for lean Shopify stores.
- Safety: approval-first by default.
- First 10 stores: founder-led setup, strict limits, and weekly review.

## First 10 Store Limits
Use these limits until the app has real store proof.

- 1 Shopify store per customer.
- Approval mode for emails, discounts, and campaigns.
- Manual onboarding and weekly founder-led check-in.
- AI usage focused only on revenue/margin workflows.
- Email can stay manual/mock until a verified email provider is connected.
- No guaranteed revenue promise.

## Demo Flow
Use this order for a clean 12-15 minute demo.

1. Open Dashboard.
   - Say: "This is the founder command center. It shows profit impact, agent activity, customer signals, and worker health."
2. Click Load sample data.
   - Say: "For demo, this fills the app with safe sample revenue events, carts, approvals, and product costs."
3. Open COGS.
   - Say: "Margin Guardian uses product cost to stop unsafe discounting. Missing or bad cost data blocks risky discounts."
4. Open Agents.
   - Say: "The store owner can choose Approval, Auto, or Locked for each agent."
5. Open Settings.
   - Say: "These are global safety limits: max discount, margin floor, email limits, and approval thresholds."
6. Open Approvals.
   - Say: "Risky actions wait here. The owner can approve or block before customers see anything."
7. Open Pixel.
   - Say: "This captures high-intent store signals like searches and product interest for future retention."
8. Open Analytics.
   - Say: "Revenue Analyst turns agent activity into plain-English wins, risks, and next actions."
9. Open Billing.
   - Say: "Billing is Shopify-native. The beta plan is positioned at $999/month with a test flow in dev."
10. Close with the beta ask.
   - Say: "The first pilot is focused on safe setup, revenue recovery signals, and approval-first automation. We increase autonomy only after trust is proven."

## Short Pitch
ANOTAI gives solo Shopify founders a 5-agent AI revenue team. It protects margins before discounts go live, catches abandoned-cart opportunities, tracks customer intent, and keeps risky AI actions under owner approval.

## Customer Talking Points
- "This is a founder-led private beta."
- "Agents start in approval mode, so risky customer-facing actions do not run without review."
- "The app uses store data only to power the merchant's own revenue workflows."
- "We do not sell customer data."
- "The first month is about setup, signal capture, and proving revenue opportunities."
- "Automation can be increased only after the owner trusts the workflow."

## Do Not Promise Yet
- Guaranteed recovered revenue.
- Fully autonomous campaigns from day one.
- Unlimited AI usage.
- Unlimited email sending.
- Enterprise SLA.
- Public Shopify App Store approval before review is complete.
- Real-time recovery from protected customer data before Shopify grants data approval.

## Environment Checklist
Required for local/dev:

- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SCOPES=read_products,write_discounts`
- `SHOPIFY_APP_URL`
- `SHOPIFY_BILLING_TEST=true`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`

Required before hosted beta:

- `JOB_RUNNER_SECRET`
- Stable HTTPS app URL
- Supabase migrations applied
- Shopify app config URL updated
- Privacy, terms, and support URLs reachable

Required before real customer email:

- `RESEND_API_KEY`
- Verified sender/domain
- Email rate limits aligned with owner safety settings

## Final Pre-Demo Checklist
- Open Shopify embedded app without blank/error screen.
- Load sample data.
- Confirm Dashboard shows live demo metrics.
- Confirm COGS shows product costs.
- Confirm Approvals shows pending actions and approve/block works.
- Confirm Agents and Settings save owner controls.
- Confirm Billing page opens and does not crash.
- Confirm `/privacy`, `/terms`, and `/support` load.
- Run `npx tsc --noEmit`.
- Run `npm run build`.

## Production Later
These are not required for a local beta demo, but are required before public launch.

- Stable hosting and domain.
- Shopify live billing mode.
- Resend or another verified email provider.
- Protected customer data approval if using real cart/order/customer topics.
- Monitoring and error alerts.
- Full billing lifecycle handling for cancellations/downgrades.
- Shopify app review assets and screencast.

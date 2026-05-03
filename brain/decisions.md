# ANOTAI Decisions Memory

## Product Decisions
- ANOTAI starts as a paid private beta, not a public app store launch.
- Starter price target is $999/month, but early beta can be founder-led.
- Approval-first mode is default for customer-facing or revenue-changing actions.
- Do not sell customer data. Use data only to provide merchant-facing value.

## Technical Decisions
- Keep current Shopify Remix app as the source of truth.
- Manus or other tools can be used as reference/prototype only, not direct production authority.
- Supabase stores ANOTAI business data; Prisma remains only for Shopify sessions.
- Delayed recovery uses database-driven jobs, not in-memory timers.
- Shopify discount must be created before email is sent.
- Missing COGS blocks discounts.
- Use Shopify Billing instead of external Stripe links for Shopify public app compatibility.

## Collaboration Decisions
- Codex owns final implementation in the real repo.
- Other AI tools can generate ideas, summaries, or isolated reference snippets.
- Do not let two tools edit the same production files at the same time.
- Run build after major changes.

## Risk Notes
- Cloudflare trycloudflare URLs expire and cause Shopify blank/error screens.
- Protected Shopify topics/scopes may require approval before real cart/order data works.
- Supabase migrations must be applied manually unless a direct database URL is configured.
- Local/dev MVP can be shown to prospects, but production launch requires stable hosting, live billing, real email, monitoring, and review assets.

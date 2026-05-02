# ⚙️ INSTALLATION GUIDE (Developers)

How to set up the ANOTAI production environment.

## 1. Environment Variables
Ensure the following are set in your hosting provider (Fly.io/Vercel/etc):
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SCOPES`: (Refer to shopify.app.toml)
- `SHOPIFY_APP_URL`: Your production domain.
- `DATABASE_URL`: Postgres connection string.
- `SUPABASE_URL` & `SUPABASE_ANON_KEY`
- `GEMINI_API_KEY`
- `RESEND_API_KEY`
- `ADMIN_DEBUG_TOKEN`: For accessing /internal/debug.

## 2. Shopify Configuration
1. Update `shopify.app.toml` with your production URL.
2. Run `npx shopify app deploy`.
3. Ensure webhooks are registered in the Shopify Admin.

## 3. Database Migrations
1. Connect to your Supabase instance.
2. Run the SQL scripts in `supabase/` folder in order:
   - `00_phase2_upgrade.sql`
   - `01_phase2_hierarchy_upgrade.sql`
   - `02_phase3_seed_hierarchy.sql`
   - `03_phase8_hardening.sql`

## 4. Verification
1. Visit `your-domain.com/internal/debug?token=YOUR_TOKEN`.
2. Check that the "Global Kill Switches" section is visible.
3. Test a webhook using the Shopify CLI: `shopify app webhook trigger --topic carts/update`.

---

## 5. Hosting: DigitalOcean App Platform
Use the following settings when deploying via the GitHub Student Developer Pack:

- **Service Type**: `Web Service`
- **Build Command**: `npm run build`
- **Run Command**: `npm run docker-start`
- **HTTP Port**: `3000`
- **Node Version**: `20` (specified in Dockerfile)

### Critical Configuration
1. **Database Persistence**: By default, DO App Platform has an ephemeral filesystem. If using SQLite, session data will be lost on redeploy. **Highly Recommended**: Switch Prisma to use your Supabase Postgres connection string for `DATABASE_URL` before scaling.
2. **App URL**: Once DigitalOcean provides your domain (e.g., `anotai-xxx.ondigitalocean.app`), you **must** update `SHOPIFY_APP_URL` in env vars and `shopify.app.toml`.

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import { createBillingCharge, checkBillingStatus } from "~/services/billing.server";
import { supabase } from "~/utils/supabase.server";
import { ensureStoreForSession } from "~/utils/store.server";

const starterAgents = [
  "Margin Guardian",
  "Cart Sniper",
  "AI Personal Shopper",
  "Retention Engine",
  "Revenue Analyst",
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  await ensureStoreForSession(session);
  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");

  if (chargeId) {
    const billing = await checkBillingStatus(admin);
    if (billing.active) {
      await supabase
        .from("stores")
        .update({ plan_status: "active", billing_id: billing.subscription_id })
        .eq("shop_domain", session.shop);

      return redirect("/app");
    }
  }

  const billing = await checkBillingStatus(admin);

  return json({
    shop: session.shop,
    billing: {
      active: billing.active,
      trial_days: billing.trial_days_remaining || 0,
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  await ensureStoreForSession(session);

  const returnUrl = `${process.env.SHOPIFY_APP_URL}/app/billing?shop=${session.shop}`;
  const confirmationUrl = await createBillingCharge(admin, returnUrl);

  if (confirmationUrl) {
    return redirect(confirmationUrl);
  }

  return json({ error: "Failed to create billing charge" }, { status: 500 });
};

export default function BillingPage() {
  const { billing } = useLoaderData<typeof loader>();

  if (billing.active) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.badge}>ACTIVE</div>
          <h1 style={styles.title}>Starter Plan Active</h1>
          <p style={styles.subtitle}>
            Your 5-agent AI revenue team is ready inside ANOTAI.
          </p>
          {billing.trial_days > 0 && (
            <p style={styles.trial}>{billing.trial_days} trial days remaining</p>
          )}
          <a href="/app" style={styles.button}>
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.badge}>STARTER</div>
        <h1 style={styles.heroTitle}>ANOTAI Revenue Team</h1>
        <p style={styles.tagline}>
          Five AI agents for solo Shopify founders who need sales recovery,
          margin protection, upsells, retention, and a clear daily operator report.
        </p>

        <div style={styles.agentList}>
          {starterAgents.map((agent) => (
            <div style={styles.agentRow} key={agent}>
              <span style={styles.agentMark}>AI</span>
              <span>{agent}</span>
            </div>
          ))}
        </div>

        <div style={styles.pricing}>
          <span style={styles.price}>$999</span>
          <span style={styles.period}>/month</span>
        </div>
        <p style={styles.trialText}>
          7-day trial. Approval mode by default before risky actions go live.
        </p>

        <Form method="post">
          <button type="submit" style={styles.cta}>
            Start 7-Day Trial
          </button>
        </Form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    background:
      "radial-gradient(circle at 12% 15%, rgba(16, 185, 129, 0.22), transparent 28%), #F6F8F5",
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: 24,
  },
  card: {
    background: "#FFFFFF",
    border: "1px solid #DDE5DD",
    borderRadius: 8,
    padding: 36,
    maxWidth: 540,
    width: "100%",
    textAlign: "left",
    boxShadow: "0 24px 70px rgba(15, 23, 42, 0.12)",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    border: "1px solid #0F172A",
    borderRadius: 999,
    padding: "5px 10px",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.7,
    color: "#0F172A",
    marginBottom: 18,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: 900,
    color: "#0F172A",
    letterSpacing: 0,
    margin: "0 0 10px",
  },
  tagline: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 1.6,
    margin: "0 0 24px",
  },
  agentList: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 10,
    margin: "0 0 28px",
  },
  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: "#0F172A",
    fontSize: 14,
    fontWeight: 700,
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    padding: "11px 12px",
  },
  agentMark: {
    display: "grid",
    placeItems: "center",
    width: 28,
    height: 28,
    borderRadius: 6,
    background: "#0F172A",
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: 900,
  },
  pricing: {
    margin: "0 0 6px",
  },
  price: {
    fontSize: 48,
    fontWeight: 900,
    color: "#0F172A",
  },
  period: {
    fontSize: 18,
    color: "#64748B",
  },
  trialText: {
    color: "#166534",
    fontSize: 14,
    margin: "0 0 22px",
  },
  cta: {
    width: "100%",
    padding: "15px 28px",
    background: "#0F172A",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 800,
    cursor: "pointer",
  },
  title: {
    fontSize: 28,
    fontWeight: 900,
    color: "#0F172A",
    margin: "0 0 8px",
  },
  subtitle: {
    color: "#475569",
    fontSize: 15,
    margin: "0 0 10px",
  },
  trial: {
    color: "#166534",
    fontSize: 14,
    margin: "0 0 22px",
  },
  button: {
    display: "inline-flex",
    padding: "12px 20px",
    background: "#0F172A",
    color: "#FFFFFF",
    borderRadius: 8,
    textDecoration: "none",
    fontWeight: 800,
    fontSize: 14,
  },
};

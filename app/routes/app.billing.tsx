import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import { createBillingCharge, checkBillingStatus } from "~/services/billing.server";
import { supabase } from "~/utils/supabase.server";
import { ensureStoreForSession } from "~/utils/store.server";

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

      // Set the merchant settings plan to match what they paid for
      let planKey = "growth";
      if (billing.current_plan?.includes("Scale")) planKey = "scale";
      if (billing.current_plan?.includes("Elite")) planKey = "elite";

      await supabase.from("merchant_agent_settings")
        .upsert({ store_id: (await ensureStoreForSession(session)).id, plan_key: planKey }, { onConflict: "store_id" });

      return redirect("/app");
    }
  }

  const billing = await checkBillingStatus(admin);

  return json({
    shop: session.shop,
    billing: {
      active: billing.active,
      trial_days: billing.trial_days_remaining || 0,
      current_plan: billing.current_plan || "None"
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  await ensureStoreForSession(session);

  const formData = await request.formData();
  const planName = formData.get("planName") as string;
  const planPrice = Number(formData.get("planPrice"));

  const returnUrl = `${process.env.SHOPIFY_APP_URL}/app/billing?shop=${session.shop}`;
  const confirmationUrl = await createBillingCharge(admin, returnUrl, planName, planPrice);

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
          <h1 style={styles.title}>{billing.current_plan} Active</h1>
          <p style={styles.subtitle}>
            Your Virtual AI Team is ready and operating on the {billing.current_plan} tier.
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
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontSize: 36, fontWeight: 900, color: '#0F172A', marginBottom: 12 }}>Scale your revenue with an AI Team</h1>
        <p style={{ fontSize: 16, color: '#475569', maxWidth: 600, margin: '0 auto' }}>Select the plan that matches your current monthly recurring revenue.</p>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
        
        {/* GROWTH PLAN */}
        <div style={styles.card}>
          <div style={styles.badge}>GROWTH</div>
          <h2 style={styles.heroTitle}>ANOTAI Growth</h2>
          <p style={styles.tagline}>For stores $50K - $150K/mo.</p>
          
          <div style={styles.pricing}>
            <span style={styles.price}>$999</span>
            <span style={styles.period}>/mo</span>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: '24px 0', fontSize: 14, color: '#0F172A', lineHeight: 2 }}>
            <li>✅ 6 Active Agents</li>
            <li>✅ 5,000 AI Interactions</li>
            <li>✅ 500 Recovery Emails</li>
            <li>❌ No War Room mode</li>
          </ul>

          <Form method="post">
            <input type="hidden" name="planName" value="ANOTAI Growth" />
            <input type="hidden" name="planPrice" value="999.0" />
            <button type="submit" style={styles.cta}>Start 7-Day Trial</button>
          </Form>
        </div>

        {/* SCALE PLAN */}
        <div style={{...styles.card, border: '2px solid #8B5CF6', transform: 'scale(1.05)', zIndex: 10 }}>
          <div style={{...styles.badge, background: '#8B5CF6', color: 'white', border: 'none'}}>SCALE (POPULAR)</div>
          <h2 style={styles.heroTitle}>ANOTAI Scale</h2>
          <p style={styles.tagline}>For stores $150K - $500K/mo.</p>
          
          <div style={styles.pricing}>
            <span style={styles.price}>$1,999</span>
            <span style={styles.period}>/mo</span>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: '24px 0', fontSize: 14, color: '#0F172A', lineHeight: 2 }}>
            <li>✅ 12 Active Agents</li>
            <li>✅ 20,000 AI Interactions</li>
            <li>✅ 2,000 Recovery Emails</li>
            <li>✅ Limited War Room mode</li>
          </ul>

          <Form method="post">
            <input type="hidden" name="planName" value="ANOTAI Scale" />
            <input type="hidden" name="planPrice" value="1999.0" />
            <button type="submit" style={{...styles.cta, background: '#8B5CF6'}}>Start 7-Day Trial</button>
          </Form>
        </div>

        {/* ELITE PLAN */}
        <div style={styles.card}>
          <div style={styles.badge}>ELITE</div>
          <h2 style={styles.heroTitle}>ANOTAI Elite</h2>
          <p style={styles.tagline}>For stores $500K+/mo.</p>
          
          <div style={styles.pricing}>
            <span style={styles.price}>$2,599</span>
            <span style={styles.period}>/mo</span>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: '24px 0', fontSize: 14, color: '#0F172A', lineHeight: 2 }}>
            <li>✅ 24-Agent Virtual Team</li>
            <li>✅ 50,000 AI Interactions</li>
            <li>✅ 5,000 Recovery Emails</li>
            <li>✅ Full War Room mode</li>
          </ul>

          <Form method="post">
            <input type="hidden" name="planName" value="ANOTAI Elite" />
            <input type="hidden" name="planPrice" value="2599.0" />
            <button type="submit" style={styles.cta}>Start 7-Day Trial</button>
          </Form>
        </div>

      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    background: "radial-gradient(circle at 12% 15%, rgba(139, 92, 246, 0.15), transparent 28%), #F8FAFC",
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: "40px 24px",
  },
  card: {
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: 16,
    padding: 32,
    width: 320,
    textAlign: "left",
    boxShadow: "0 10px 15px -3px rgba(15, 23, 42, 0.1)",
    position: "relative"
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    border: "1px solid #0F172A",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 1,
    color: "#0F172A",
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: 800,
    color: "#0F172A",
    margin: "0 0 8px",
  },
  tagline: {
    color: "#64748B",
    fontSize: 13,
    margin: "0 0 20px",
  },
  pricing: {
    margin: "0 0 6px",
  },
  price: {
    fontSize: 36,
    fontWeight: 900,
    color: "#0F172A",
  },
  period: {
    fontSize: 14,
    color: "#64748B",
  },
  cta: {
    width: "100%",
    padding: "12px",
    background: "#0F172A",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
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

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { AppSidebar } from "~/components/AppSidebar";
import { createBillingCharge, checkBillingStatus } from "~/services/billing.server";
import { authenticate } from "~/shopify.server";
import { supabase } from "~/utils/supabase.server";
import { ensureStoreForSession } from "~/utils/store.server";
import "~/styles/dashboard.css";

type ActionResult = { error?: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const store = await ensureStoreForSession(session).catch((error) => {
    console.warn("Billing store sync fallback used:", error);
    return null;
  });

  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");

  if (chargeId) {
    const billing = await checkBillingStatus(admin);
    if (billing.active && store) {
      await supabase
        .from("stores")
        .update({
          plan_status: "active",
          billing_id: billing.subscription_id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", store.id);

      // Link plan key to agent settings
      let planKey = "growth";
      if (billing.current_plan?.includes("Scale")) planKey = "scale";
      if (billing.current_plan?.includes("Elite")) planKey = "elite";

      await supabase.from("merchant_agent_settings")
        .upsert({ store_id: store.id, plan_key: planKey }, { onConflict: "store_id" });

      return redirect("/app?billing=active");
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
    storeReady: Boolean(store),
    testMode: process.env.SHOPIFY_BILLING_TEST !== "false",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const store = await ensureStoreForSession(session).catch((error) => {
    console.warn("Billing store sync skipped before charge:", error);
    return null;
  });

  if (!store) {
    return json<ActionResult>(
      { error: "Store data is still syncing. Refresh and try again." },
      { status: 503 }
    );
  }

  const formData = await request.formData();
  const planName = String(formData.get("planName") || "ANOTAI Growth");
  const planPrice = Number(formData.get("planPrice") || 999.0);

  const origin = new URL(request.url).origin;
  const returnUrl = `${origin}/app/billing?shop=${encodeURIComponent(session.shop)}`;

  try {
    const confirmationUrl = await createBillingCharge(admin, returnUrl, planName, planPrice);
    if (confirmationUrl) {
      return redirect(confirmationUrl);
    }
  } catch (error) {
    return json<ActionResult>(
      { error: error instanceof Error ? error.message : "Billing approval could not be created." },
      { status: 500 }
    );
  }

  return json<ActionResult>({ error: "Billing approval could not be created." }, { status: 500 });
};

export default function BillingPage() {
  const { shop, billing, storeReady, testMode } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="dashboard-layout">
      <AppSidebar active="billing" />

      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Subscription Plans</h1>
            <p className="page-subtitle">
              Scale your revenue with an AI virtual team. Select the plan that matches your monthly recurring revenue.
            </p>
          </div>
          <span className="beta-pill">{billing.active ? "Active" : testMode ? "Test Mode" : "Production"}</span>
        </div>

        {actionData?.error && <div style={errorStyle}>{actionData.error}</div>}
        {!storeReady && (
          <div style={warningStyle}>
            Store data is still syncing. Refresh the page before starting a new subscription.
          </div>
        )}

        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center', marginTop: '20px' }}>
          
          {/* GROWTH PLAN */}
          <PlanCard 
            name="ANOTAI Growth" 
            price={999} 
            tagline="For stores $50K - $150K/mo."
            features={[
              "6 Active Agents",
              "5,000 AI Interactions",
              "500 Recovery Emails",
              "Approval-first mode"
            ]}
            isActive={billing.current_plan?.includes("Growth")}
          />

          {/* SCALE PLAN */}
          <PlanCard 
            name="ANOTAI Scale" 
            price={1999} 
            tagline="For stores $150K - $500K/mo."
            features={[
              "12 Active Agents",
              "20,000 AI Interactions",
              "2,000 Recovery Emails",
              "Limited War Room mode"
            ]}
            popular
            isActive={billing.current_plan?.includes("Scale")}
          />

          {/* ELITE PLAN */}
          <PlanCard 
            name="ANOTAI Elite" 
            price={2599} 
            tagline="For stores $500K+/mo."
            features={[
              "24-Agent Virtual Team",
              "50,000 AI Interactions",
              "5,000 Recovery Emails",
              "Full War Room mode"
            ]}
            isActive={billing.current_plan?.includes("Elite")}
          />

        </div>

        {billing.active && (
          <div className="card" style={{ marginTop: '40px', border: '1px solid var(--green)', background: 'var(--gray-50)' }}>
            <h2 className="section-title">Active Subscription</h2>
            <p style={statusCopyStyle}>
              Your {billing.current_plan} plan is active. Agents are operating within your safety limits.
            </p>
            {billing.trial_days > 0 && (
              <p style={trialStyle}>{billing.trial_days} trial days remaining</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function PlanCard({ name, price, tagline, features, popular, isActive }: { name: string, price: number, tagline: string, features: string[], popular?: boolean, isActive?: boolean }) {
  return (
    <div style={{
      ...planCardBaseStyle,
      ...(popular ? popularPlanStyle : {}),
      ...(isActive ? activePlanStyle : {})
    }}>
      {popular && <div style={popularBadgeStyle}>POPULAR</div>}
      {isActive && <div style={activeBadgeStyle}>CURRENT PLAN</div>}
      <h2 style={planTitleStyle}>{name}</h2>
      <p style={planTaglineStyle}>{tagline}</p>
      
      <div style={pricingBoxStyle}>
        <span style={priceStyle}>${price.toLocaleString()}</span>
        <span style={periodStyle}>/mo</span>
      </div>

      <ul style={featureListStyle}>
        {features.map((f, i) => (
          <li key={i} style={featureItemStyle}>
            <span style={{ color: 'var(--green)', marginRight: '8px' }}>✓</span> {f}
          </li>
        ))}
      </ul>

      <Form method="post">
        <input type="hidden" name="planName" value={name} />
        <input type="hidden" name="planPrice" value={price} />
        <button type="submit" disabled={isActive} style={{
          ...ctaButtonStyle,
          ...(popular ? { background: '#8B5CF6' } : {}),
          ...(isActive ? { background: 'var(--gray-200)', color: 'var(--gray-500)', cursor: 'default' } : {})
        }}>
          {isActive ? "Active Plan" : "Start 7-Day Trial"}
        </button>
      </Form>
    </div>
  );
}

const planCardBaseStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 16,
  padding: 32,
  width: 320,
  textAlign: "left",
  boxShadow: "0 10px 15px -3px rgba(15, 23, 42, 0.1)",
  position: "relative",
  display: 'flex',
  flexDirection: 'column'
};

const popularPlanStyle: React.CSSProperties = {
  border: '2px solid #8B5CF6',
  transform: 'scale(1.05)',
  zIndex: 10
};

const activePlanStyle: React.CSSProperties = {
  borderColor: 'var(--green)',
  background: '#F0FDF4'
};

const popularBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: -12,
  left: '50%',
  transform: 'translateX(-50%)',
  background: '#8B5CF6',
  color: 'white',
  padding: '4px 12px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: 1
};

const activeBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: -12,
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'var(--green)',
  color: 'white',
  padding: '4px 12px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: 1
};

const planTitleStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 800,
  color: "#0F172A",
  margin: "0 0 8px",
};

const planTaglineStyle: React.CSSProperties = {
  color: "#64748B",
  fontSize: 13,
  margin: "0 0 20px",
};

const pricingBoxStyle: React.CSSProperties = {
  margin: "0 0 12px",
};

const priceStyle: React.CSSProperties = {
  fontSize: 36,
  fontWeight: 900,
  color: "#0F172A",
};

const periodStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#64748B",
};

const featureListStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: '24px 0',
  fontSize: 14,
  color: "#0F172A",
  lineHeight: 2,
  flexGrow: 1
};

const featureItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center'
};

const ctaButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  background: "#0F172A",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  transition: 'all 0.2s ease'
};

const statusCopyStyle: React.CSSProperties = {
  margin: "0 0 16px",
  color: "#475569",
  fontSize: 14,
  lineHeight: 1.55,
  fontWeight: 650,
};

const trialStyle: React.CSSProperties = {
  color: "#166534",
  fontSize: 14,
  fontWeight: 700
};

const errorStyle: React.CSSProperties = {
  background: "#FEE2E2",
  color: "#991B1B",
  padding: "12px 16px",
  borderRadius: 8,
  marginBottom: 18,
  fontSize: 14,
  fontWeight: 800,
};

const warningStyle: React.CSSProperties = {
  background: "#FEF3C7",
  color: "#92400E",
  padding: "12px 16px",
  borderRadius: 8,
  marginBottom: 18,
  fontSize: 14,
  fontWeight: 800,
};

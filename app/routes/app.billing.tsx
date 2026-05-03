import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { AppSidebar } from "~/components/AppSidebar";
import { createBillingCharge, checkBillingStatus } from "~/services/billing.server";
import { authenticate } from "~/shopify.server";
import { supabase } from "~/utils/supabase.server";
import { ensureStoreForSession } from "~/utils/store.server";
import "~/styles/dashboard.css";

const starterAgents = [
  ["MG", "Margin Guardian", "Blocks discounts that would break the profit floor."],
  ["CS", "Cart Sniper", "Queues abandoned-cart recovery with owner approval."],
  ["PS", "AI Personal Shopper", "Finds high-fit bundles and AOV opportunities."],
  ["RE", "Retention Engine", "Matches customer intent with future product drops."],
  ["RA", "Revenue Analyst", "Turns activity into a plain-English operator report."],
];

const betaIncludes = [
  "7-day Shopify billing trial in dev/test mode",
  "Approval-first setup for customer emails and discounts",
  "COGS-based margin protection before offers go live",
  "Founder-led onboarding for the first beta stores",
];

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
        .eq("shop_domain", session.shop);

      return redirect("/app?billing=active");
    }

    if (billing.active) {
      return redirect("/app?billing=active");
    }
  }

  const billing = await checkBillingStatus(admin);

  return json({
    shop: session.shop,
    billing: {
      active: billing.active,
      trial_days: billing.trial_days_remaining || 0,
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
      { error: "Store data is still syncing. Refresh the app and try billing again." },
      { status: 503 }
    );
  }

  const origin = new URL(request.url).origin;
  const returnUrl = `${origin}/app/billing?shop=${encodeURIComponent(session.shop)}`;

  try {
    const confirmationUrl = await createBillingCharge(admin, returnUrl);
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
  const { billing, storeReady, testMode } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="dashboard-layout">
      <AppSidebar active="billing" />

      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Founder Beta Plan</h1>
            <p className="page-subtitle">
              Shopify-native billing for the approval-first ANOTAI beta. Test mode is safe for the dev store.
            </p>
          </div>
          <span className="beta-pill">{billing.active ? "Active" : testMode ? "Test mode" : "Live mode"}</span>
        </div>

        {actionData?.error && <div style={errorStyle}>{actionData.error}</div>}
        {!storeReady && (
          <div style={warningStyle}>
            Store data is still syncing. Billing status can be viewed, but starting a new approval needs
            the database connection to be healthy.
          </div>
        )}

        <div style={billingHeroStyle}>
          <div>
            <span className="readiness-label">AI revenue team</span>
            <h2 style={billingTitleStyle}>$999/month starter beta</h2>
            <p style={billingCopyStyle}>
              Five agents help a Shopify founder recover carts, protect margin, spot retention signals,
              and review revenue actions before anything risky runs automatically.
            </p>
          </div>

          <div style={priceBoxStyle}>
            <strong>$999</strong>
            <span>/month</span>
            <small>7-day trial</small>
          </div>
        </div>

        <div className="ops-grid">
          <div className="ops-card">
            <div className="ops-card-header">
              <span>Included in beta</span>
              <strong>{billing.active ? "Unlocked" : "Approval required"}</strong>
            </div>
            <div style={includeListStyle}>
              {betaIncludes.map((item) => (
                <div style={includeRowStyle} key={item}>
                  <span style={checkStyle}>OK</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ops-card">
            <div className="ops-card-header">
              <span>Billing status</span>
              <strong className={billing.active ? "" : "danger-text"}>
                {billing.active ? "Active" : "Needs approval"}
              </strong>
            </div>
            <p style={statusCopyStyle}>
              {billing.active
                ? "The plan is active. Keep agents in approval mode until the merchant confirms the workflow."
                : "Use the Shopify approval screen to simulate the $999 subscription on the dev store."}
            </p>
            {billing.trial_days > 0 && (
              <p style={trialStyle}>{billing.trial_days} trial days remaining</p>
            )}
            {billing.active ? (
              <Link to="/app" className="primary-action">Open Dashboard</Link>
            ) : (
              <Form method="post">
                <button type="submit" className="primary-action">Start Shopify Billing Test</button>
              </Form>
            )}
          </div>
        </div>

        <div className="card">
          <h2 className="section-title">Agent package</h2>
          <div style={agentGridStyle}>
            {starterAgents.map(([initials, name, text]) => (
              <div style={agentPlanCardStyle} key={name}>
                <span style={agentBadgeStyle}>{initials}</span>
                <strong>{name}</strong>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="section-title">Safe beta rule</h2>
          <p style={statusCopyStyle}>
            During beta, customer-facing email sends, discount creation, and high-impact campaigns should stay
            in owner approval mode. This protects trust while the store validates recovered revenue.
          </p>
        </div>
      </main>
    </div>
  );
}

const billingHeroStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 220px",
  gap: 20,
  alignItems: "stretch",
  background: "#0F172A",
  color: "#FFFFFF",
  borderRadius: 8,
  padding: 26,
  marginBottom: 18,
  boxShadow: "0 14px 36px rgba(15, 23, 42, 0.12)",
};

const billingTitleStyle: React.CSSProperties = {
  margin: "8px 0 10px",
  fontSize: 38,
  lineHeight: 1,
  letterSpacing: 0,
};

const billingCopyStyle: React.CSSProperties = {
  maxWidth: 760,
  margin: 0,
  color: "#CBD5E1",
  fontSize: 15,
  lineHeight: 1.6,
  fontWeight: 650,
};

const priceBoxStyle: React.CSSProperties = {
  display: "grid",
  alignContent: "center",
  justifyItems: "start",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 8,
  padding: 18,
  background: "rgba(255,255,255,0.07)",
};

const includeListStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const includeRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  color: "#334155",
  fontSize: 14,
  fontWeight: 750,
};

const checkStyle: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 28,
  height: 28,
  borderRadius: 8,
  background: "#DCFCE7",
  color: "#166534",
  fontSize: 10,
  fontWeight: 1000,
  flexShrink: 0,
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
  fontSize: 13,
  fontWeight: 900,
};

const agentGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const agentPlanCardStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  padding: 14,
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  background: "#F8FAFC",
};

const agentBadgeStyle: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 34,
  height: 34,
  borderRadius: 8,
  background: "#0F172A",
  color: "#FFFFFF",
  fontSize: 11,
  fontWeight: 1000,
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

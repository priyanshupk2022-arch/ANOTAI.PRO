import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { getBetaReadiness } from "~/services/beta-readiness.server";
import type { BetaReadinessItem } from "~/services/beta-readiness.server";
import { authenticate } from "~/shopify.server";
import { ensureStoreForSession } from "~/utils/store.server";
import { AppSidebar } from "~/components/AppSidebar";
import "~/styles/dashboard.css";

const pilotSteps = [
  "Install app on the Shopify store.",
  "Keep agents in approval-first mode.",
  "Add COGS for top products.",
  "Install customer signal pixel.",
  "Review dashboard, approvals, and worker health daily.",
  "Collect merchant feedback before enabling stronger automation.",
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await ensureStoreForSession(session).catch((error) => {
    console.warn("Onboarding store sync fallback used:", error);
    return null;
  });

  if (!store) {
    return json({
      shop: session.shop,
      readiness: {
        readyCount: 0,
        totalCount: 0,
        items: [],
      },
      storeReady: false,
    });
  }

  const readiness = await getBetaReadiness(store.id).catch((error) => {
    console.warn("Beta readiness fallback used:", error);
    return {
      readyCount: 0,
      totalCount: 0,
      items: [],
    };
  });

  return json({
    shop: session.shop,
    readiness,
    storeReady: true,
  });
};

export default function OnboardingPage() {
  const { shop, readiness, storeReady } = useLoaderData<typeof loader>();
  const score = readiness.totalCount
    ? Math.round((readiness.readyCount / readiness.totalCount) * 100)
    : 0;
  const readinessItems = readiness.items.filter(
    (item): item is BetaReadinessItem => Boolean(item)
  );

  return (
    <div className="dashboard-layout">
      <AppSidebar active="onboarding" />

      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Beta Onboarding</h1>
            <p className="page-subtitle">
              Prepare {shop} for a paid private beta without turning on risky automation too early.
            </p>
          </div>
          <span className="beta-pill">{score}% Ready</span>
        </div>

        {!storeReady && (
          <div style={warningStyle}>
            Store sync is not ready. Refresh after database/tunnel connection is healthy.
          </div>
        )}

        <div className="card">
          <div style={heroRowStyle}>
            <div>
              <span style={eyebrowStyle}>Private beta rule</span>
              <h2 style={heroTitleStyle}>Approval-first launch</h2>
              <p style={heroTextStyle}>
                The app can show value to merchants now, while emails, discounts, and high-impact actions
                stay controlled by the owner until the pilot is stable.
              </p>
            </div>
            <Link to="/app/approvals" style={primaryButtonStyle}>Open Approvals</Link>
          </div>
        </div>

        <div className="ops-grid">
          <div className="ops-card">
            <div className="ops-card-header">
              <span>Readiness Checklist</span>
              <strong>{readiness.readyCount}/{readiness.totalCount}</strong>
            </div>
            <div style={readinessListStyle}>
              {readinessItems.map((item) => (
                <Link to={item.href || "/app/onboarding"} key={item.key} style={readinessItemStyle}>
                  <span style={statusDotStyle(item.status)} />
                  <div>
                    <strong style={itemTitleStyle}>{item.title}</strong>
                    <p style={itemDetailStyle}>{item.detail}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="ops-card">
            <div className="ops-card-header">
              <span>Pilot Playbook</span>
              <strong>10 stores max</strong>
            </div>
            <div style={playbookStyle}>
              {pilotSteps.map((step, index) => (
                <div style={playbookStepStyle} key={step}>
                  <span style={stepNumberStyle}>{index + 1}</span>
                  <p>{step}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="section-title">Founder Beta Promise</h2>
          <div style={promiseGridStyle}>
            <PromiseCard title="What they get" text="A 5-agent AI revenue team, founder onboarding, weekly reports, and approval-first revenue opportunities." />
            <PromiseCard title="What stays controlled" text="No unlimited AI, no hidden customer emails, no unsafe discounts, and no fully autonomous risky campaigns during beta." />
            <PromiseCard title="What to measure" text="Recovered revenue, margin risks blocked, customer signals captured, approval speed, and merchant feedback." />
          </div>
        </div>
      </main>
    </div>
  );
}

function PromiseCard({ title, text }: { title: string; text: string }) {
  return (
    <div style={promiseCardStyle}>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

const warningStyle: React.CSSProperties = {
  background: "#FEF3C7",
  color: "#92400E",
  padding: "12px 16px",
  borderRadius: 8,
  marginBottom: 24,
  fontSize: 14,
  fontWeight: 700,
};

const heroRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 20,
  alignItems: "center",
};

const eyebrowStyle: React.CSSProperties = {
  color: "#166534",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.8,
  textTransform: "uppercase",
};

const heroTitleStyle: React.CSSProperties = {
  margin: "4px 0 8px",
  color: "#0F172A",
  fontSize: 28,
  lineHeight: 1.1,
};

const heroTextStyle: React.CSSProperties = {
  margin: 0,
  color: "#64748B",
  fontSize: 14,
  lineHeight: 1.55,
  maxWidth: 620,
};

const primaryButtonStyle: React.CSSProperties = {
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  minHeight: 42,
  padding: "11px 16px",
  borderRadius: 8,
  background: "#0F172A",
  color: "#FFFFFF",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 900,
};

const readinessListStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const readinessItemStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  padding: 12,
  borderRadius: 10,
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  textDecoration: "none",
};

const statusDotStyle = (status: string): React.CSSProperties => ({
  width: 10,
  height: 10,
  borderRadius: 999,
  marginTop: 5,
  flexShrink: 0,
  background:
    status === "ready" ? "#22C55E" : status === "manual" ? "#F59E0B" : "#EF4444",
});

const itemTitleStyle: React.CSSProperties = {
  display: "block",
  color: "#0F172A",
  fontSize: 13,
  marginBottom: 4,
};

const itemDetailStyle: React.CSSProperties = {
  margin: 0,
  color: "#64748B",
  fontSize: 12,
  lineHeight: 1.45,
};

const playbookStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

const playbookStepStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  color: "#334155",
  fontSize: 13,
  lineHeight: 1.45,
};

const stepNumberStyle: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 26,
  height: 26,
  borderRadius: 8,
  background: "#DCFCE7",
  color: "#166534",
  fontSize: 12,
  fontWeight: 900,
  flexShrink: 0,
};

const promiseGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const promiseCardStyle: React.CSSProperties = {
  border: "1px solid #E2E8F0",
  borderRadius: 10,
  background: "#F8FAFC",
  padding: 14,
  color: "#0F172A",
  fontSize: 13,
  lineHeight: 1.45,
};

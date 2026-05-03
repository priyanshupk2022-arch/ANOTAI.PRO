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
            <Link to="/app/approvals" className="btn-primary">Open Approvals</Link>
          </div>
        </div>

        <div className="ops-grid">
          <div className="card">
            <div className="ops-card-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <span style={{ fontWeight: 800 }}>Readiness Checklist</span>
              <strong style={{ fontSize: '13px', color: 'var(--primary)' }}>{readiness.readyCount}/{readiness.totalCount}</strong>
            </div>
            <div style={readinessListStyle}>
              {readinessItems.map((item) => (
                <Link to={item.href || "/app/onboarding"} key={item.key} style={readinessItemStyle}>
                  <div className={`status-dot ${item.status === 'ready' ? 'active' : item.status === 'manual' ? 'warning' : 'red'}`} />
                  <div>
                    <strong style={{ display: 'block', fontSize: '13px', color: 'var(--navy)', marginBottom: '4px' }}>{item.title}</strong>
                    <p style={{ fontSize: '12px', color: 'var(--gray-500)', lineHeight: 1.4 }}>{item.detail}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="ops-card-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <span style={{ fontWeight: 800 }}>Pilot Playbook</span>
              <strong style={{ fontSize: '11px', color: 'var(--gray-400)', textTransform: 'uppercase' }}>10 stores max</strong>
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
            <PromiseCard title="What stays controlled" text="No unlimited AI, no hidden customer emails, no unsafe discounts, and no risky campaigns during beta." />
            <PromiseCard title="What to measure" text="Recovered revenue, margin risks blocked, customer signals captured, and merchant feedback." />
          </div>
        </div>
      </main>
    </div>
  );
}

function PromiseCard({ title, text }: { title: string; text: string }) {
  return (
    <div style={promiseCardStyle}>
      <strong style={{ display: 'block', marginBottom: '8px', color: 'var(--navy)' }}>{title}</strong>
      <p style={{ margin: 0, fontSize: '12px', color: 'var(--gray-500)', lineHeight: 1.5 }}>{text}</p>
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
  color: "var(--navy)",
  fontSize: 28,
  lineHeight: 1.1,
  fontWeight: 800,
};

const heroTextStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--gray-500)",
  fontSize: 14,
  lineHeight: 1.55,
  maxWidth: 620,
};

const readinessListStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

const readinessItemStyle: React.CSSProperties = {
  display: "flex",
  gap: 16,
  alignItems: "flex-start",
  padding: '16px',
  borderRadius: 12,
  background: "var(--gray-50)",
  border: "1px solid var(--gray-100)",
  textDecoration: "none",
  transition: 'all 0.2s ease',
};

const playbookStyle: React.CSSProperties = {
  display: "grid",
  gap: 16,
};

const playbookStepStyle: React.CSSProperties = {
  display: "flex",
  gap: 14,
  alignItems: "flex-start",
  color: "var(--navy)",
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
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 16,
};

const promiseCardStyle: React.CSSProperties = {
  border: "1px solid var(--gray-100)",
  borderRadius: 12,
  background: "var(--gray-50)",
  padding: 16,
};

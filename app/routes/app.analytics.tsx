import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { getDashboardOverview } from "~/agents/orchestrator";
import { authenticate } from "~/shopify.server";
import { ensureStoreForSession } from "~/utils/store.server";
import "~/styles/dashboard.css";

const fallbackOverview = {
  metrics: {
    total_revenue_impact: 0,
    revenue_recovered: 0,
    aov_increase_pct: 0,
    intents_captured: 0,
    vip_emails_sent: 0,
    margin_loss: 0,
  },
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await ensureStoreForSession(session).catch((error) => {
    console.warn("Analytics store sync fallback used:", error);
    return null;
  });

  if (!store) {
    return json({ overview: fallbackOverview, storeReady: false });
  }

  const overview = await getDashboardOverview(store.id).catch((error) => {
    console.warn("Analytics overview fallback used:", error);
    return fallbackOverview;
  });

  return json({ overview, storeReady: true });
};

export default function AnalyticsPage() {
  const { overview, storeReady } = useLoaderData<typeof loader>();
  const metrics = overview.metrics;

  return (
    <div className="dashboard-layout">
      <nav className="sidebar">
        <div className="sidebar-brand">ANOTAI</div>
        <ul className="sidebar-nav">
          <li><a className="sidebar-item" href="/app"><span className="sidebar-item-icon">DB</span> Dashboard</a></li>
          <li><a className="sidebar-item" href="/app/cogs"><span className="sidebar-item-icon">MG</span> COGS Manager</a></li>
          <li><a className="sidebar-item" href="/app/agents"><span className="sidebar-item-icon">AI</span> Agents</a></li>
          <li><a className="sidebar-item active" href="/app/analytics"><span className="sidebar-item-icon">RA</span> Analytics</a></li>
        </ul>
        <div className="sidebar-divider" />
        <div className="sidebar-label">Setup</div>
        <ul className="sidebar-nav">
          <li><a className="sidebar-item" href="/app/pixel"><span className="sidebar-item-icon">PX</span> Web Pixel</a></li>
          <li><a className="sidebar-item" href="/app/settings"><span className="sidebar-item-icon">ST</span> Settings</a></li>
        </ul>
      </nav>

      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">MVP performance snapshot from your ANOTAI revenue team.</p>
        </div>

        {!storeReady && (
          <div style={warningStyle}>
            Live data is not connected right now, so this page is showing zero-state metrics.
          </div>
        )}

        <div className="agents-grid">
          <MetricCard label="Revenue impact" value={`$${metrics.total_revenue_impact.toLocaleString()}`} />
          <MetricCard label="Recovered revenue" value={`$${metrics.revenue_recovered.toLocaleString()}`} />
          <MetricCard label="Intents captured" value={metrics.intents_captured.toLocaleString()} />
          <MetricCard label="VIP emails sent" value={metrics.vip_emails_sent.toLocaleString()} />
        </div>

        <div className="card">
          <h2 className="section-title">What This Means</h2>
          <p className="feed-empty">
            Revenue Analyst will turn these numbers into a daily founder report after the agent flows
            are connected to live store events.
          </p>
          <Link to="/app" className="restock-btn">Back to Dashboard</Link>
        </div>
      </main>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="agent-card">
      <div className="agent-card-label">{label}</div>
      <div className="agent-card-metric">{value}</div>
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

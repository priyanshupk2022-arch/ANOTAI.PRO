import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { getDashboardOverview } from "~/agents/orchestrator";
import { fallbackFounderReport, getFounderReport } from "~/agents/revenue-analyst";
import { authenticate } from "~/shopify.server";
import { ensureStoreForSession } from "~/utils/store.server";
import { AppSidebar } from "~/components/AppSidebar";
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
    return json({ overview: fallbackOverview, founderReport: fallbackFounderReport, storeReady: false });
  }

  const [overview, founderReport] = await Promise.all([
    getDashboardOverview(store.id).catch((error) => {
      console.warn("Analytics overview fallback used:", error);
      return fallbackOverview;
    }),
    getFounderReport(store.id).catch((error) => {
      console.warn("Founder report fallback used:", error);
      return fallbackFounderReport;
    }),
  ]);

  return json({ overview, founderReport, storeReady: true });
};

export default function AnalyticsPage() {
  const { overview, founderReport, storeReady } = useLoaderData<typeof loader>();
  const metrics = overview.metrics;

  return (
    <div className="dashboard-layout">
      <AppSidebar active="analytics" />

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
          <h2 className="section-title">Revenue Analyst Report</h2>
          <div style={reportHeroStyle}>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#0F172A" }}>
              {founderReport.headline}
            </div>
            <p style={{ margin: "8px 0 0", color: "#64748B", fontSize: 14, lineHeight: 1.6 }}>
              {founderReport.summary}
            </p>
          </div>

          <div style={reportGridStyle}>
            <ReportList title="Wins" items={founderReport.wins} tone="green" />
            <ReportList title="Risks" items={founderReport.risks} tone="amber" />
            <ReportList title="Next Actions" items={founderReport.nextActions} tone="dark" />
          </div>
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

function ReportList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "green" | "amber" | "dark";
}) {
  const toneStyle = {
    green: { borderColor: "#BBF7D0", background: "#F0FDF4" },
    amber: { borderColor: "#FDE68A", background: "#FFFBEB" },
    dark: { borderColor: "#CBD5E1", background: "#F8FAFC" },
  }[tone];

  return (
    <div style={{ ...reportBoxStyle, ...toneStyle }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: "#0F172A", marginBottom: 10 }}>
        {title}
      </div>
      <ul style={{ display: "grid", gap: 8, margin: 0, paddingLeft: 18 }}>
        {items.map((item) => (
          <li style={{ color: "#475569", fontSize: 13, lineHeight: 1.5 }} key={item}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

const reportHeroStyle: React.CSSProperties = {
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: 16,
  marginBottom: 14,
};

const reportGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const reportBoxStyle: React.CSSProperties = {
  border: "1px solid",
  borderRadius: 8,
  padding: 14,
};

const warningStyle: React.CSSProperties = {
  background: "#FEF3C7",
  color: "#92400E",
  padding: "12px 16px",
  borderRadius: 8,
  marginBottom: 24,
  fontSize: 14,
  fontWeight: 700,
};

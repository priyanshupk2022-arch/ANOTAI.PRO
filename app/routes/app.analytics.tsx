import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
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
          <h1 className="page-title">Performance Analytics</h1>
          <p className="page-subtitle">Real-time snapshot of your AI revenue team's impact.</p>
        </div>

        {!storeReady && (
          <div style={warningStyle}>
            Live data is not connected. Metrics are currently showing zero-state.
          </div>
        )}

        <div className="agents-grid" style={{ marginBottom: '32px' }}>
          <MetricCard label="Total Impact" value={`$${metrics.total_revenue_impact.toLocaleString()}`} icon="🚀" />
          <MetricCard label="Recovered" value={`$${metrics.revenue_recovered.toLocaleString()}`} icon="🎯" />
          <MetricCard label="Intents Captured" value={metrics.intents_captured.toLocaleString()} icon="🛰️" />
          <MetricCard label="VIP Emails" value={metrics.vip_emails_sent.toLocaleString()} icon="✉️" />
        </div>

        <div className="card" style={{ marginBottom: '32px' }}>
          <h2 className="section-title">Revenue Analyst Intelligence</h2>
          <div style={reportHeroStyle}>
            <div style={{ fontSize: 18, fontWeight: 900, color: "var(--navy)" }}>
              {founderReport.headline}
            </div>
            <p style={{ margin: "8px 0 0", color: "var(--gray-500)", fontSize: 14, lineHeight: 1.6 }}>
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
          <h2 className="section-title">AOV & Margin Health</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div style={{ background: 'var(--gray-50)', padding: '20px', borderRadius: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', marginBottom: '8px' }}>AOV Increase</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--navy)' }}>+{metrics.aov_increase_pct}%</div>
            </div>
            <div style={{ background: 'var(--gray-50)', padding: '20px', borderRadius: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', marginBottom: '8px' }}>Margin Leaks Blocked</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--green)' }}>${metrics.margin_loss.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="card" style={{ marginBottom: 0, textAlign: 'center', padding: '24px' }}>
      <div style={{ fontSize: '24px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--navy)' }}>{value}</div>
    </div>
  );
}

function ReportList({ title, items, tone }: { title: string; items: string[]; tone: "green" | "amber" | "dark" }) {
  const toneStyle = {
    green: { borderColor: "#BBF7D0", background: "#F0FDF4" },
    amber: { borderColor: "#FDE68A", background: "#FFFBEB" },
    dark: { borderColor: "#CBD5E1", background: "#F8FAFC" },
  }[tone];

  return (
    <div style={{ ...reportBoxStyle, ...toneStyle }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: "var(--navy)", marginBottom: 10 }}>
        {title}
      </div>
      <ul style={{ display: "grid", gap: 8, margin: 0, paddingLeft: 18 }}>
        {items.map((item) => (
          <li style={{ color: "var(--gray-600)", fontSize: 13, lineHeight: 1.5 }} key={item}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

const reportHeroStyle: React.CSSProperties = {
  background: "var(--gray-50)",
  border: "1px solid var(--gray-100)",
  borderRadius: 12,
  padding: 20,
  marginBottom: 20,
};

const reportGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
};

const reportBoxStyle: React.CSSProperties = {
  border: "1px solid",
  borderRadius: 12,
  padding: 16,
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

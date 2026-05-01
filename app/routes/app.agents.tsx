import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import { getAgentStatuses } from "~/agents/orchestrator";
import { ensureStoreForSession } from "~/utils/store.server";
import "~/styles/dashboard.css";

const AGENT_INFO: Record<
  string,
  { description: string; howItWorks: string; promise: string }
> = {
  margin_guardian: {
    description: "Protects every sale from margin leaks and unsafe discounts.",
    howItWorks:
      "Checks COGS and profit floor before discount, recovery, or bundle actions are allowed.",
    promise: "No discount goes live unless profit is protected.",
  },
  personal_shopper: {
    description: "Increases average order value with guided bundles and upsells.",
    howItWorks:
      "Reads catalog context, proposes bundles, and sends every offer through Margin Guardian.",
    promise: "More revenue per visitor without random discounts.",
  },
  cart_sniper: {
    description: "Recovers abandoned carts with controlled follow-up offers.",
    howItWorks:
      "Detects cart abandonment, waits for the right moment, then sends a margin-safe recovery offer.",
    promise: "Bring back customers who were about to leave money behind.",
  },
  retention_engine: {
    description: "Turns customer intent into repeat purchases.",
    howItWorks:
      "Captures searches and product interest, then prepares targeted return campaigns.",
    promise: "Customers come back because the store remembers what they wanted.",
  },
  revenue_analyst: {
    description: "Explains what the AI team did and what to do next.",
    howItWorks:
      "Summarizes recovered revenue, protected margin, agent actions, and next opportunities.",
    promise: "The founder gets a clear daily operator report.",
  },
};

const fallbackAgents = Object.keys(AGENT_INFO).map((name) => ({
  name,
  display_name:
    name === "margin_guardian"
      ? "Margin Guardian"
      : name === "personal_shopper"
        ? "AI Personal Shopper"
        : name === "cart_sniper"
          ? "Cart Sniper"
          : name === "retention_engine"
            ? "Retention Engine"
            : "Revenue Analyst",
  emoji: name
    .split("_")
    .map((part) => part[0]?.toUpperCase())
    .join(""),
  color: "#0F172A",
  status: "active",
  today_actions: 0,
  revenue_impact: 0,
}));

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await ensureStoreForSession(session).catch((error) => {
    console.warn("Agents store sync skipped:", error);
    return null;
  });

  if (!store) {
    return json({ agents: fallbackAgents });
  }

  const agents = await getAgentStatuses(store.id).catch((error) => {
    console.warn("Agent status fallback used:", error);
    return fallbackAgents;
  });

  return json({ agents });
};

export default function AgentsPage() {
  const { agents } = useLoaderData<typeof loader>();

  return (
    <div className="dashboard-layout animate-fade-in">
      <nav className="sidebar">
        <div className="sidebar-brand">ANOTAI</div>
        <ul className="sidebar-nav">
          <li><a className="sidebar-item" href="/app"><span className="sidebar-item-icon">📊</span> Dashboard</a></li>
          <li><a className="sidebar-item" href="/app/cogs"><span className="sidebar-item-icon">💰</span> COGS Manager</a></li>
          <li><a className="sidebar-item" href="/app/approvals"><span className="sidebar-item-icon">✅</span> Approvals</a></li>
          <li><a className="sidebar-item active" href="/app/agents"><span className="sidebar-item-icon">🤖</span> AI Agents</a></li>
          <li><a className="sidebar-item" href="/app/analytics"><span className="sidebar-item-icon">📈</span> Analytics</a></li>
        </ul>
        <div className="sidebar-divider" />
        <div className="sidebar-label">System</div>
        <ul className="sidebar-nav">
          <li><a className="sidebar-item" href="/app/pixel"><span className="sidebar-item-icon">🛰️</span> Web Pixel</a></li>
          <li><a className="sidebar-item" href="/app/settings"><span className="sidebar-item-icon">⚙️</span> Settings</a></li>
        </ul>
      </nav>

      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Your AI Revenue Team</h1>
          <p className="page-subtitle">
            Five specialized agents working 24/7 to protect your margins and grow your revenue.
          </p>
        </div>

        <div className="agents-grid">
          {agents.map((agent: any) => {
            const info = AGENT_INFO[agent.name] || {
              description: "Revenue operations agent.",
              howItWorks: "Works inside the ANOTAI operating system.",
              promise: "Keeps the founder focused on growth.",
            };

            return (
              <div className="agent-card-premium" key={agent.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                  <div className="agent-icon-box" style={{ marginBottom: 0 }}>{agent.emoji}</div>
                  <div className="badge badge-success">
                    <span className="status-dot active" style={{ marginRight: '6px' }} />
                    Active
                  </div>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--navy)', marginBottom: '4px' }}>{agent.display_name}</h3>
                  <p style={{ fontSize: '13px', color: 'var(--gray-500)', lineHeight: '1.4' }}>{info.description}</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                  <div style={{ background: 'var(--gray-50)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--navy)' }}>{agent.today_actions}</div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Actions</div>
                  </div>
                  <div style={{ background: 'var(--gray-50)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--green)' }}>${(agent.revenue_impact || 0).toLocaleString()}</div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Impact</div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--gray-100)', paddingTop: '16px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--gray-600)', marginBottom: '8px' }}>
                    <strong style={{ color: 'var(--navy)' }}>How it works:</strong> {info.howItWorks}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--gray-600)' }}>
                    <strong style={{ color: 'var(--navy)' }}>Promise:</strong> {info.promise}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

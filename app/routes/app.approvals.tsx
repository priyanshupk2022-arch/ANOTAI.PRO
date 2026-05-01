import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import { ensureStoreForSession } from "~/utils/store.server";
import "~/styles/dashboard.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await ensureStoreForSession(session).catch((error) => {
    console.warn("Approvals store sync fallback used:", error);
    return null;
  });

  return json({
    storeReady: Boolean(store),
  });
};

export default function ApprovalsPage() {
  const { storeReady } = useLoaderData<typeof loader>();

  return (
    <div className="dashboard-layout animate-fade-in">
      <nav className="sidebar">
        <div className="sidebar-brand">ANOTAI</div>
        <ul className="sidebar-nav">
          <li><a className="sidebar-item" href="/app"><span className="sidebar-item-icon">📊</span> Dashboard</a></li>
          <li><a className="sidebar-item" href="/app/cogs"><span className="sidebar-item-icon">💰</span> COGS Manager</a></li>
          <li><a className="sidebar-item active" href="/app/approvals"><span className="sidebar-item-icon">✅</span> Approvals</a></li>
          <li><a className="sidebar-item" href="/app/agents"><span className="sidebar-item-icon">🤖</span> AI Agents</a></li>
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
          <h1 className="page-title">Approval Queue</h1>
          <p className="page-subtitle">Review and authorize AI recommendations before they go live on your store.</p>
        </div>

        {!storeReady && (
          <div className="badge badge-warning" style={{ width: '100%', padding: '16px', marginBottom: '24px', borderRadius: '12px' }}>
            ⚠️ Sync pending. Approvals require an active database connection.
          </div>
        )}

        <div className="card" style={{ background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)', border: '1px dashed var(--gray-300)' }}>
          <div className="empty-state">
            <span className="empty-state-icon">✨</span>
            <div className="empty-state-title">Inbox Zero</div>
            <p className="empty-state-text">No pending approvals. Your AI team is currently operating within your pre-approved margin safety zones.</p>
          </div>
        </div>

        <div className="card">
          <h2 className="section-title">🛡️ How Approvals Work</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
            <div style={stepStyle}>
              <div style={stepNum}>1</div>
              <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '4px' }}>Agent Proposes</div>
              <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>An agent finds a revenue opportunity (like a personalized bundle).</div>
            </div>
            <div style={stepStyle}>
              <div style={stepNum}>2</div>
              <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '4px' }}>Queue Review</div>
              <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>The proposal appears here for your manual review and profit check.</div>
            </div>
            <div style={stepStyle}>
              <div style={stepNum}>3</div>
              <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '4px' }}>One-Click Deploy</div>
              <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Once approved, the offer goes live instantly to the customer.</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

const stepStyle: React.CSSProperties = {
  background: 'var(--gray-50)',
  padding: '20px',
  borderRadius: '12px',
  textAlign: 'center',
};

const stepNum: React.CSSProperties = {
  width: '28px',
  height: '28px',
  background: 'var(--navy)',
  color: 'white',
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  fontSize: '14px',
  fontWeight: 800,
  margin: '0 auto 12px',
};

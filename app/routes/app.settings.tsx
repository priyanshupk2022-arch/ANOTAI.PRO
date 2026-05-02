import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import { ensureStoreForSession } from "~/utils/store.server";
import "~/styles/dashboard.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await ensureStoreForSession(session).catch((error) => {
    console.warn("Settings store sync fallback used:", error);
    return null;
  });

  const [hasCOGS, hasActions, safetySettings] = await Promise.all([
    supabase.from("products_cogs").select("id").eq("store_id", store?.id || "").limit(1).then(r => !!r.data?.length),
    supabase.from("agent_actions").select("id").eq("store_id", store?.id || "").limit(1).then(r => !!r.data?.length),
    supabase.from("merchant_agent_settings").select("*").eq("store_id", store?.id || "").single().then(r => r.data),
  ]);

  return json({
    shop: session.shop,
    planStatus: store?.plan_status || "setup_pending",
    storeReady: Boolean(store),
    appUrl: process.env.SHOPIFY_APP_URL || "",
    onboardingStatus: {
      hasCOGS,
      hasActions,
      safetyConfigured: Boolean(safetySettings),
      recoveryEnabled: safetySettings?.recovery_emails_enabled || false,
      playbookDone: Boolean(store?.settings?.brand_voice),
    }
  });
};

export default function SettingsPage() {
  const { shop, planStatus, storeReady, appUrl, onboardingStatus } = useLoaderData<typeof loader>();

  return (
    <div className="dashboard-layout animate-fade-in">
      <nav className="sidebar">
        <div className="sidebar-brand">ANOTAI</div>
        <ul className="sidebar-nav">
          <li><a className="sidebar-item" href="/app"><span className="sidebar-item-icon">📊</span> Dashboard</a></li>
          <li><a className="sidebar-item" href="/app/cogs"><span className="sidebar-item-icon">💰</span> COGS Manager</a></li>
          <li><a className="sidebar-item" href="/app/approvals"><span className="sidebar-item-icon">✅</span> Approvals</a></li>
          <li><a className="sidebar-item" href="/app/agents"><span className="sidebar-item-icon">🤖</span> AI Agents</a></li>
          <li><a className="sidebar-item" href="/app/analytics"><span className="sidebar-item-icon">📈</span> Analytics</a></li>
        </ul>
        <div className="sidebar-divider" />
        <div className="sidebar-label">System</div>
        <ul className="sidebar-nav">
          <li><a className="sidebar-item" href="/app/pixel"><span className="sidebar-item-icon">🛰️</span> Web Pixel</a></li>
          <li><a className="sidebar-item active" href="/app/settings"><span className="sidebar-item-icon">⚙️</span> Settings</a></li>
        </ul>
      </nav>

      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure your ANOTAI revenue operating system and check setup status.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div className="card" style={{ marginBottom: 0 }}>
              <h2 className="section-title">🏪 Store Identity</h2>
              <div className="feed-list">
                <div className="feed-item">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', color: 'var(--gray-400)', fontWeight: 700, textTransform: 'uppercase' }}>Shop domain</div>
                    <div style={{ fontWeight: 600, color: 'var(--navy)' }}>{shop}</div>
                  </div>
                </div>
                <div className="feed-item">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', color: 'var(--gray-400)', fontWeight: 700, textTransform: 'uppercase' }}>Plan Status</div>
                    <div className="badge badge-success" style={{ marginTop: '4px' }}>{planStatus.replace('_', ' ')}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 0 }}>
              <h2 className="section-title">⚡ Quick Actions</h2>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Link to="/app/cogs" className="btn-primary">Update COGS</Link>
                <Link to="/app/pixel" className="btn-primary" style={{ background: 'var(--primary)' }}>Setup Pixel</Link>
                <Link to="/app/onboarding" className="btn-primary" style={{ background: 'var(--gray-200)', color: 'var(--navy)' }}>Edit Playbook</Link>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 0 }}>
            <h2 className="section-title">🚀 Launch Checklist</h2>
            <div className="feed-list">
              <ChecklistItem label="Brand Playbook" description="Expert niche & brand voice training" status={onboardingStatus.playbookDone ? 'done' : 'pending'} />
              <ChecklistItem label="COGS Added" description="Required for Margin Guardian protection" status={onboardingStatus.hasCOGS ? 'done' : 'pending'} />
              <ChecklistItem label="Safety Config" description="Daily limits & automation gates" status={onboardingStatus.safetyConfigured ? 'done' : 'pending'} />
              <ChecklistItem label="Cart Recovery" description="Enable Cart Sniper engine" status={onboardingStatus.recoveryEnabled ? 'done' : 'pending'} />
              <ChecklistItem label="First Action" description="AI observed its first interaction" status={onboardingStatus.hasActions ? 'done' : 'pending'} />
              <ChecklistItem label="Billing" description="Approve the beta/production plan" status={planStatus === 'active' ? 'done' : 'pending'} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function ChecklistItem({ label, description, status }: { label: string; description: string; status: 'done' | 'pending' }) {
  return (
    <div className="feed-item">
      <div style={{ marginRight: '16px' }}>
        {status === 'done' ? (
          <div style={{ color: 'var(--green)', fontSize: '20px' }}>✅</div>
        ) : (
          <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: '2px solid var(--gray-200)' }} />
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: '14px' }}>{label}</div>
        <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>{description}</div>
      </div>
    </div>
  );
}

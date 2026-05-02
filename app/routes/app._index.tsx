import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import { ensureStoreForSession } from "~/utils/store.server";
import { 
  getActivityMetrics, 
  getOpportunityPipelineMetrics, 
  getMarginRiskMetrics, 
  getNextBestActions, 
  getActivationScore 
} from "~/services/metrics.server";
import "~/styles/dashboard.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await ensureStoreForSession(session);

  if (!store) {
    return json({
      activity: null,
      pipeline: null,
      risks: null,
      nextActions: [],
      activation: null,
    });
  }

  const [activity, pipeline, risks, nextActions, activation] = await Promise.all([
    getActivityMetrics(store.id),
    getOpportunityPipelineMetrics(store.id),
    getMarginRiskMetrics(store.id),
    getNextBestActions(store.id),
    getActivationScore(store.id),
  ]);

  return json({
    activity,
    pipeline,
    risks,
    nextActions,
    activation,
  });
};

export default function Dashboard() {
  const { activity, pipeline, risks, nextActions, activation } = useLoaderData<typeof loader>();

  const fmtCurrency = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

  return (
    <div className="dashboard-layout animate-fade-in">
      <nav className="sidebar">
        <div className="sidebar-brand">ANOTAI</div>
        <ul className="sidebar-nav">
          <li><a className="sidebar-item active" href="/app"><span className="sidebar-item-icon">📊</span> Dashboard</a></li>
          <li><a className="sidebar-item" href="/app/queue"><span className="sidebar-item-icon">⚡</span> Action Queue</a></li>
          <li><a className="sidebar-item" href="/app/debate"><span className="sidebar-item-icon">🗣️</span> War Room</a></li>
          <li><a className="sidebar-item" href="/app/ai-team"><span className="sidebar-item-icon">🤖</span> AI Team</a></li>
          <li><a className="sidebar-item" href="/app/usage"><span className="sidebar-item-icon">📈</span> Usage</a></li>
        </ul>
        <div className="sidebar-divider" />
        <div className="sidebar-label">System</div>
        <ul className="sidebar-nav">
          <li><a className="sidebar-item" href="/app/billing"><span className="sidebar-item-icon">💳</span> Billing</a></li>
          <li><a className="sidebar-item" href="/app/settings"><span className="sidebar-item-icon">⚙️</span> Settings</a></li>
        </ul>
      </nav>

      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Value Activity & Opportunity Pipeline</h1>
          <p className="page-subtitle">ANOTAI is active, protecting your margins, and detecting growth opportunities 24/7.</p>
        </div>

        {/* TOP METRICS GRID */}
        <div className="agents-grid" style={{ marginBottom: '40px' }}>
          <div className="card" style={{ padding: '24px', borderTop: '4px solid var(--primary)' }}>
            <div className="hero-label" style={{ marginBottom: '8px' }}>Opportunities Detected</div>
            <div className="hero-value" style={{ fontSize: '32px', color: 'var(--navy)', marginBottom: '4px' }}>
              {fmtCurrency(pipeline?.total_abandoned_cart_value_detected || 0)}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Potential cart value detected (30d)</div>
          </div>

          <div className="card" style={{ padding: '24px', borderTop: '4px solid var(--gold)' }}>
            <div className="hero-label" style={{ marginBottom: '8px' }}>Margin Risks Blocked</div>
            <div className="hero-value" style={{ fontSize: '32px', color: 'var(--gold)', marginBottom: '4px' }}>
              {risks?.margin_risk_actions_blocked || 0}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Unsafe discounts & offers prevented</div>
          </div>

          <div className="card" style={{ padding: '24px', borderTop: '4px solid var(--green)' }}>
            <div className="hero-label" style={{ marginBottom: '8px' }}>Tasks Completed</div>
            <div className="hero-value" style={{ fontSize: '32px', color: 'var(--green)', marginBottom: '4px' }}>
              {activity?.agent_tasks_completed || 0}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Autonomous agency actions taken</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '32px' }}>
          
          {/* LEFT COLUMN: ACTIVITY & PIPELINE */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            
            {/* Activation Score for New Stores */}
            {activation && (
              <div className="card" style={{ background: 'linear-gradient(to right, #ffffff, var(--ivory))' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h2 className="section-title" style={{ marginBottom: 0 }}>Agency Activation Score</h2>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--primary)' }}>{activation.score}%</div>
                </div>
                <div style={{ width: '100%', height: '10px', background: 'var(--gray-100)', borderRadius: '5px', overflow: 'hidden', marginBottom: '24px' }}>
                  <div style={{ width: `${activation.score}%`, height: '100%', background: 'var(--primary)' }}></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {activation.checklist.map((item: any, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <span style={{ color: item.completed ? 'var(--green)' : 'var(--gray-300)' }}>{item.completed ? '✓' : '○'}</span>
                      <span style={{ color: item.completed ? 'var(--navy)' : 'var(--gray-400)' }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pipeline Table */}
            <div className="card">
              <h2 className="section-title">📡 Opportunity Pipeline</h2>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Detection</th>
                    <th>Potential Value</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Cart Sniper</strong></td>
                    <td>Abandoned Carts</td>
                    <td>{fmtCurrency(pipeline?.total_abandoned_cart_value_detected || 0)}</td>
                    <td><span className="badge badge-warning">Drafting Offers</span></td>
                  </tr>
                  <tr>
                    <td><strong>Personal Shopper</strong></td>
                    <td>Customer Queries</td>
                    <td>—</td>
                    <td><span className="badge badge-success">Handling Leads</span></td>
                  </tr>
                  <tr>
                    <td><strong>Retention Engine</strong></td>
                    <td>VIP Retention</td>
                    <td>—</td>
                    <td><span className="badge badge-success">Monitoring</span></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Margin Protection */}
            <div className="card">
              <h2 className="section-title">🛡️ Margin Risk Protection</h2>
              <div className="agents-grid">
                <div style={{ textAlign: 'center', padding: '20px', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--red)' }}>{risks?.unsafe_discounts_blocked || 0}</div>
                  <div style={{ fontSize: '12px', color: 'var(--gray-500)', textTransform: 'uppercase', fontWeight: 700 }}>Unsafe Discounts Blocked</div>
                </div>
                <div style={{ textAlign: 'center', padding: '20px', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--gold)' }}>{risks?.unsafe_free_shipping_offers_blocked || 0}</div>
                  <div style={{ fontSize: '12px', color: 'var(--gray-500)', textTransform: 'uppercase', fontWeight: 700 }}>Unsafe Shipping Blocked</div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: NEXT BEST ACTIONS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div className="card" style={{ background: 'var(--navy)', color: 'white' }}>
              <h2 className="section-title" style={{ color: 'var(--gold)' }}>⚡ Next Best Actions</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {nextActions.length === 0 ? (
                  <p style={{ fontSize: '14px', color: 'var(--gray-400)' }}>Your agency is fully optimized. No pending setup tasks.</p>
                ) : nextActions.map((action: any, i: number) => (
                  <div key={i} style={{ borderLeft: `3px solid ${action.priority === 'high' ? 'var(--red)' : 'var(--gold)'}`, padding: '12px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                    <div style={{ fontWeight: 700, marginBottom: '4px' }}>{action.title}</div>
                    <p style={{ fontSize: '12px', color: 'var(--gray-400)', marginBottom: '12px' }}>{action.reason}</p>
                    <a href={action.link} className="btn-primary" style={{ padding: '6px 12px', fontSize: '11px', background: action.priority === 'high' ? 'var(--red)' : 'var(--gold)', color: 'var(--navy)' }}>
                      {action.cta}
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Activity Stats */}
            <div className="card">
              <h2 className="section-title">📊 Activity Summary</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <span style={{ color: 'var(--gray-500)' }}>Interactions Handled</span>
                  <strong>{activity?.customer_interactions_handled || 0}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <span style={{ color: 'var(--gray-500)' }}>Recovery Emails Sent</span>
                  <strong>{activity?.recovery_emails_sent || 0}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <span style={{ color: 'var(--gray-500)' }}>Actions Pending</span>
                  <strong style={{ color: (activity?.actions_pending || 0) > 0 ? 'var(--gold)' : 'var(--navy)' }}>{activity?.actions_pending || 0}</strong>
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

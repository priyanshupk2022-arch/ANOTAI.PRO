import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import { supabase } from "~/utils/supabase.server";
import { ensureStoreForSession } from "~/utils/store.server";
import { getDepartmentActivityMetrics } from "~/services/metrics.server";
import "~/styles/dashboard.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await ensureStoreForSession(session);

  if (!store) {
    return json({ usage: null, plan: null, deptActivity: {} });
  }

  const billingMonth = new Date().toISOString().slice(0, 7);

  const [usageData, settingsData, deptActivity] = await Promise.all([
    supabase.from("monthly_usage_counters").select("*").eq("store_id", store.id).eq("billing_month", billingMonth).single(),
    supabase.from("merchant_agent_settings").select("plan_key, plan_configs(*)").eq("store_id", store.id).single(),
    getDepartmentActivityMetrics(store.id)
  ]);

  return json({ 
    usage: usageData.data || {
      ai_interactions_used: 0,
      recovery_emails_sent: 0,
      war_room_decisions_used: 0,
      estimated_ai_cost: 0
    }, 
    plan: settingsData.data?.plan_configs || {
      plan_name: "Pilot",
      ai_interaction_limit: 1000,
      recovery_email_limit: 100,
      war_room_limit: 0
    },
    deptActivity
  });
};

export default function UsagePage() {
  const { usage, plan, deptActivity } = useLoaderData<typeof loader>();

  const aiPercent = Math.min(100, Math.round((usage.ai_interactions_used / plan.ai_interaction_limit) * 100)) || 0;
  const emailPercent = Math.min(100, Math.round((usage.recovery_emails_sent / plan.recovery_email_limit) * 100)) || 0;
  const warRoomPercent = plan.war_room_limit > 0 ? Math.min(100, Math.round((usage.war_room_decisions_used / plan.war_room_limit) * 100)) : 0;

  return (
    <div className="dashboard-layout animate-fade-in">
      <nav className="sidebar">
        <div className="sidebar-brand">ANOTAI</div>
        <ul className="sidebar-nav">
          <li><a className="sidebar-item" href="/app"><span className="sidebar-item-icon">📊</span> Dashboard</a></li>
          <li><a className="sidebar-item" href="/app/queue"><span className="sidebar-item-icon">⚡</span> Action Queue</a></li>
          <li><a className="sidebar-item" href="/app/debate"><span className="sidebar-item-icon">🗣️</span> War Room</a></li>
          <li><a className="sidebar-item" href="/app/ai-team"><span className="sidebar-item-icon">🤖</span> AI Team</a></li>
          <li><a className="sidebar-item active" href="/app/usage"><span className="sidebar-item-icon">📈</span> Usage</a></li>
        </ul>
      </nav>

      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Usage & Cost Tracking</h1>
          <p className="page-subtitle">Monitor your virtual team's consumption and deployment state.</p>
        </div>

        <div className="hero-metric" style={{ padding: '40px', marginBottom: '40px', background: 'var(--navy)' }}>
          <div className="hero-label" style={{ color: 'var(--gray-300)' }}>Current Plan</div>
          <div className="hero-value" style={{ fontSize: '48px', color: 'white', marginBottom: '0' }}>
            {plan.plan_name} Plan
          </div>
          <div style={{ marginTop: '20px' }}>
            <a href="/app/billing" className="btn-primary" style={{ background: 'var(--gold)', color: 'var(--navy)' }}>Upgrade Plan</a>
          </div>
        </div>

        <div className="agents-grid">
          <div className="card">
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--navy)', marginBottom: '16px' }}>AI Interactions</h3>
            <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--navy)', marginBottom: '8px' }}>
              {usage.ai_interactions_used.toLocaleString()} <span style={{ fontSize: '16px', color: 'var(--gray-400)', fontWeight: 500 }}>/ {plan.ai_interaction_limit.toLocaleString()}</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'var(--gray-100)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${aiPercent}%`, height: '100%', background: aiPercent > 90 ? 'var(--red)' : 'var(--primary)' }}></div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--navy)', marginBottom: '16px' }}>Recovery Emails</h3>
            <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--navy)', marginBottom: '8px' }}>
              {usage.recovery_emails_sent.toLocaleString()} <span style={{ fontSize: '16px', color: 'var(--gray-400)', fontWeight: 500 }}>/ {plan.recovery_email_limit.toLocaleString()}</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'var(--gray-100)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${emailPercent}%`, height: '100%', background: emailPercent > 90 ? 'var(--red)' : 'var(--gold)' }}></div>
            </div>
          </div>
        </div>

        <div className="page-header" style={{ marginTop: '60px', marginBottom: '24px' }}>
          <h2 className="page-title" style={{ fontSize: '24px' }}>Department Activity</h2>
          <p className="page-subtitle">Real-time task volume across your virtual agency departments.</p>
        </div>

        <div className="agents-grid">
          {Object.entries(deptActivity).map(([dept, count]: any) => (
            <div key={dept} className="card" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', marginBottom: '12px' }}>{dept}</h3>
              <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--navy)' }}>{count} <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--gray-400)' }}>tasks</span></div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

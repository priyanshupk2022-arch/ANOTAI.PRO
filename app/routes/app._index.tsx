/**
 * 📊 DASHBOARD — Idiot-Proof Dopamine Dashboard
 * 
 * Stripe-minimal. Spacious. Plain English.
 * Hero metric flashes green on new orders via Supabase Realtime.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { createClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { authenticate } from "~/shopify.server";
import { ensureStoreForSession } from "~/utils/store.server";
import "~/styles/dashboard.css";

const DASHBOARD_DATA_TIMEOUT_MS = 5000;

function getFallbackOverview() {
  return {
    agents: [
      {
        name: "margin_guardian",
        display_name: "Margin Guardian",
        emoji: "MG",
        color: "#10B981",
        status: "active",
        today_actions: 0,
        revenue_impact: 0,
      },
      {
        name: "personal_shopper",
        display_name: "AI Personal Shopper",
        emoji: "AI",
        color: "#8B5CF6",
        status: "active",
        today_actions: 0,
        revenue_impact: 0,
      },
      {
        name: "cart_sniper",
        display_name: "Cart Sniper",
        emoji: "CS",
        color: "#F59E0B",
        status: "active",
        today_actions: 0,
        revenue_impact: 0,
      },
      {
        name: "retention_engine",
        display_name: "Retention Engine",
        emoji: "RE",
        color: "#EC4899",
        status: "active",
        today_actions: 0,
        revenue_impact: 0,
      },
      {
        name: "revenue_analyst",
        display_name: "Revenue Analyst",
        emoji: "RA",
        color: "#0F172A",
        status: "active",
        today_actions: 0,
        revenue_impact: 0,
      },
    ],
    metrics: {
      total_revenue_impact: 0,
      revenue_recovered: 0,
      aov_increase_pct: 0,
      intents_captured: 0,
      vip_emails_sent: 0,
      margin_loss: 0,
    },
  };
}

async function withDashboardTimeout<T>(operation: Promise<T>) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Dashboard data timed out")),
          DASHBOARD_DATA_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await ensureStoreForSession(session).catch((error) => {
    console.warn("Dashboard store sync skipped:", error);
    return null;
  });

  if (!store) {
    return json({
      overview: getFallbackOverview(),
      activity: [],
      inventory: [],
      storeId: null,
      realtime: {
        url: process.env.SUPABASE_URL || null,
        anonKey: process.env.SUPABASE_ANON_KEY || null,
      },
    });
  }

  let overview: any = getFallbackOverview();
  let activity: any[] = [];

  try {
    // Dynamic import to prevent Vite from including server-only modules in client bundle
    const { getDashboardOverview, getActivityFeed } = await import("~/agents/orchestrator");
    
    const dashboardData = await withDashboardTimeout(
      Promise.all([getDashboardOverview(store.id), getActivityFeed(store.id, 15)]) as Promise<
        [any, any[]]
      >
    );
    overview = dashboardData[0] || overview;
    activity = Array.isArray(dashboardData[1]) ? dashboardData[1] : [];
  } catch (error) {
    console.warn("Dashboard data fallback used:", error);
  }

  const inventory = [
    { name: "Classic White Tee", stock: 142, maxStock: 200 },
    { name: "Leather Weekender Bag", stock: 8, maxStock: 100 },
    { name: "Running Shoes Pro", stock: 45, maxStock: 150 },
    { name: "Organic Face Cream", stock: 3, maxStock: 50 },
    { name: "Wireless Earbuds", stock: 67, maxStock: 200 },
  ];

  return json({
    overview,
    activity,
    inventory,
    storeId: store.id,
    realtime: {
      url: process.env.SUPABASE_URL || null,
      anonKey: process.env.SUPABASE_ANON_KEY || null,
    },
  });
};

export default function Dashboard() {
  const { overview, activity, inventory, storeId, realtime } = useLoaderData<typeof loader>();
  const [netProfit, setNetProfit] = useState(overview?.metrics?.total_revenue_impact || 0);
  const [isFlashing, setIsFlashing] = useState(false);
  const [feedItems, setFeedItems] = useState(activity || []);
  const realtimeSupabase = useMemo(() => {
    if (!realtime.url || !realtime.anonKey) return null;

    return createClient(realtime.url, realtime.anonKey);
  }, [realtime.url, realtime.anonKey]);

  // Supabase Realtime: Listen for new agent actions
  useEffect(() => {
    if (!storeId || !realtimeSupabase) return;

    const channel = realtimeSupabase
      .channel("realtime-actions")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_actions", filter: `store_id=eq.${storeId}` },
        (payload: any) => {
          const action = payload.new;
          if (action.revenue_impact > 0) {
            setNetProfit((prev: number) => prev + action.revenue_impact);
            setIsFlashing(true);
            setTimeout(() => setIsFlashing(false), 1000);
          }
          setFeedItems((prev: any[]) => [
            { id: action.id, agent: action.agent_name, type: action.action_type, payload: action.payload, revenue: action.revenue_impact, time: action.created_at },
            ...prev.slice(0, 14),
          ]);
        }
      ).subscribe();
    return () => { realtimeSupabase.removeChannel(channel); };
  }, [realtimeSupabase, storeId]);

  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
  const timeAgo = (d: string) => { const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); if (m < 1) return "Just now"; if (m < 60) return `${m}m ago`; const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`; return `${Math.floor(h / 24)}d ago`; };
  const toPlain = (a: any) => {
    const p = a.payload || {};
    switch (a.type) {
      case "cart_recovered": return { dot: "", amt: fmt(a.revenue || 0), text: "Order recovered" };
      case "bundle_accepted": return { dot: "purple", amt: fmt(a.revenue || 0), text: `Bundle accepted` };
      case "discount_blocked": return { dot: "red", amt: "", text: `Guardian blocked ${p.requested_discount_pct||0}% discount` };
      case "recovery_sent": return { dot: "amber", amt: "", text: `Recovery email sent (${p.discount_pct||0}% off)` };
      case "vip_drop_executed": return { dot: "purple", amt: "", text: `VIP drop: ${p.emails_sent||0} emails for "${p.product_title||"product"}"` };
      case "search_captured": return { dot: "", amt: "", text: `Search tracked: "${p.query||""}"` };
      default: return { dot: "", amt: "", text: a.type.replace(/_/g, " ") };
    }
  };
  const battPct = (s: number, m: number) => Math.round((s / m) * 100);

  return (
    <div className="dashboard-layout animate-fade-in">
      <nav className="sidebar">
        <div className="sidebar-brand">ANOTAI</div>
        <ul className="sidebar-nav">
          <li><a className="sidebar-item active" href="/app"><span className="sidebar-item-icon">📊</span> Dashboard</a></li>
          <li><a className="sidebar-item" href="/app/cogs"><span className="sidebar-item-icon">💰</span> COGS Manager</a></li>
          <li><a className="sidebar-item" href="/app/approvals"><span className="sidebar-item-icon">✅</span> Approvals</a></li>
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
          <h1 className="page-title">Revenue Dashboard</h1>
          <p className="page-subtitle">Your 5 AI employees are active. Zero salaries, 24/7 revenue protection.</p>
        </div>

        {/* Hero Metric */}
        <div className={`hero-metric ${isFlashing ? "flash" : ""}`}>
          <div className="hero-label">Net Profit Impact</div>
          <div className="hero-value">{fmt(netProfit)}</div>
          <span className="hero-trend">✨ Growing your bottom line</span>
        </div>

        <div className="section-title">🤖 Active Agent Team</div>
        {/* Agent Status */}
        {overview?.agents && (
          <div className="agents-grid">
            {overview.agents.map((a: any) => (
              <div className="agent-card-premium" key={a.name}>
                <div className="agent-icon-box">{a.emoji}</div>
                <div className="agent-card-name" style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>{a.display_name}</div>
                <div className="agent-card-metric">{a.today_actions}</div>
                <div className="agent-card-label">actions today</div>
                <div className="status-dot active" style={{ position: 'absolute', top: '24px', right: '24px' }} />
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '32px' }}>
          {/* Activity Feed */}
          <div className="feed-section">
            <h2 className="section-title">🛰️ Live Activity Feed</h2>
            <div className="feed-list">
              {feedItems.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-state-icon">☕</span>
                  <div className="empty-state-title">Your team is warming up</div>
                  <p className="empty-state-text">No activity yet. Your agents are standing by for store events.</p>
                </div>
              ) : feedItems.map((item: any) => {
                const d = toPlain(item);
                return (
                  <div className="feed-item" key={item.id}>
                    <div className={`status-dot ${item.revenue > 0 ? 'active' : ''}`} style={{ backgroundColor: d.dot || '#CBD5E1' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="feed-text">{d.text}</span>
                        {d.amt && <span className="badge badge-success">{d.amt}</span>}
                      </div>
                      <div className="feed-time">{timeAgo(item.time)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Battery Inventory */}
          <div className="inventory-section">
            <h2 className="section-title">🔋 Inventory Watch</h2>
            <div className="inventory-grid">
              {inventory.map((item: any, i: number) => {
                const p = battPct(item.stock, item.maxStock);
                return (
                  <div className="card" key={i} style={{ padding: '20px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <span style={{ fontWeight: 700, fontSize: '14px' }}>{item.name}</span>
                      <span className={`badge ${p <= 10 ? 'badge-error' : p <= 30 ? 'badge-warning' : 'badge-success'}`}>
                        {item.stock} units
                      </span>
                    </div>
                    <div style={{ height: '8px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                      <div 
                        style={{ 
                          height: '100%', 
                          width: `${Math.max(p, 5)}%`, 
                          background: p <= 10 ? 'var(--red)' : p <= 30 ? 'var(--amber)' : 'var(--green)',
                          transition: 'width 0.5s ease'
                        }} 
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

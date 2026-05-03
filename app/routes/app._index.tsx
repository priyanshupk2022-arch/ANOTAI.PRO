import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { createClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { authenticate } from "~/shopify.server";
import { getDashboardOverview, getActivityFeed } from "~/agents/orchestrator";
import { getPendingApprovalCount } from "~/services/agent-controls.server";
import { checkBillingStatus } from "~/services/billing.server";
import { getBetaReadiness } from "~/services/beta-readiness.server";
import { getCustomerSignalSummary } from "~/services/customer-data.server";
import { getJobQueueHealth } from "~/services/job-queue.server";
import { supabase } from "~/utils/supabase.server";
import { ensureStoreForSession } from "~/utils/store.server";
import { AppSidebar } from "~/components/AppSidebar";
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

function getFallbackCustomerSignals() {
  return {
    customers: 0,
    searches7d: 0,
    abandonedCarts7d: 0,
    recoveredCarts7d: 0,
    emailsSent7d: 0,
  };
}

function getFallbackQueueHealth() {
  return {
    pending: 0,
    processing: 0,
    failed: 0,
    completedToday: 0,
    status: "Healthy",
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
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const store = await ensureStoreForSession(session).catch((error) => {
    console.warn("Dashboard store sync skipped:", error);
    return null;
  });

  if (!store) {
    return json({
      overview: getFallbackOverview(),
      activity: [],
      inventory: [],
      pendingApprovals: 0,
      customerSignals: getFallbackCustomerSignals(),
      queueHealth: getFallbackQueueHealth(),
      billingActive: false,
      readiness: { readyCount: 0, totalCount: 0, items: [] },
      demoStatus: url.searchParams.get("demo"),
      storeId: null,
      realtime: {
        url: process.env.SUPABASE_URL || null,
        anonKey: process.env.SUPABASE_ANON_KEY || null,
      },
    });
  }

  let overview: any = getFallbackOverview();
  let activity: any[] = [];
  let pendingApprovals = 0;
  let customerSignals = getFallbackCustomerSignals();
  let queueHealth = getFallbackQueueHealth();
  let billingActive = store.plan_status === "active";
  let readiness = { readyCount: 0, totalCount: 0, items: [] as any[] };

  try {
    const billing = await checkBillingStatus(admin);
    billingActive = billing.active;

    if (billing.active && store.plan_status !== "active") {
      await supabase
        .from("stores")
        .update({
          plan_status: "active",
          billing_id: billing.subscription_id || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", store.id);
    }
  } catch (error) {
    console.warn("Dashboard billing check fallback used:", error);
  }

  try {
    const dashboardData = await withDashboardTimeout(
      Promise.all([
        getDashboardOverview(store.id),
        getActivityFeed(store.id, 15),
        getPendingApprovalCount(store.id),
        getCustomerSignalSummary(store.id),
        getJobQueueHealth(store.id),
      ]) as Promise<
        [any, any[], number, any, any]
      >
    );
    overview = dashboardData[0] || overview;
    activity = Array.isArray(dashboardData[1]) ? dashboardData[1] : [];
    pendingApprovals = dashboardData[2] || 0;
    customerSignals = dashboardData[3] || customerSignals;
    queueHealth = dashboardData[4] || queueHealth;
  } catch (error) {
    console.warn("Dashboard data fallback used:", error);
  }

  readiness = await getBetaReadiness(store.id).catch((error) => {
    console.warn("Dashboard readiness fallback used:", error);
    return readiness;
  });

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
    pendingApprovals,
    customerSignals,
    queueHealth,
    billingActive,
    readiness,
    demoStatus: url.searchParams.get("demo"),
    storeId: store.id,
    realtime: {
      url: process.env.SUPABASE_URL || null,
      anonKey: process.env.SUPABASE_ANON_KEY || null,
    },
  });
};

export default function Dashboard() {
  const { overview, activity, inventory, pendingApprovals, customerSignals, queueHealth, billingActive, readiness, demoStatus, storeId, realtime } =
    useLoaderData<typeof loader>();
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
  const battCls = (p: number) => p <= 10 ? "critical" : p <= 30 ? "low" : "";

  return (
    <div className="dashboard-layout">
      <AppSidebar active="dashboard" />

      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Beta Command Center</h1>
            <p className="page-subtitle">Track agents, approvals, customer signals, and background work before going fully autonomous.</p>
          </div>
          <span className="beta-pill">Founder Beta</span>
        </div>

        <div className="beta-readiness">
          <div>
            <span className="readiness-label">Launch status</span>
            <strong>{billingActive ? "Paid beta active" : "Paid beta setup needed"}</strong>
            <p>
              {billingActive
                ? "The store can use the agent workflow. Keep high-risk actions in approval mode until setup is complete."
                : "Start billing or keep demo/test mode active before giving this to a real customer."}
            </p>
          </div>
          <Link to={billingActive ? "/app/onboarding" : "/app/billing"}>
            {billingActive ? "Open onboarding" : "Start billing"}
          </Link>
        </div>

        <LaunchChecklist readiness={readiness} billingActive={billingActive} />

        <DemoDataPanel demoStatus={demoStatus} />

        {pendingApprovals > 0 && (
          <Link to="/app/approvals" style={approvalBannerStyle}>
            <span>{pendingApprovals} action{pendingApprovals === 1 ? "" : "s"} need owner approval</span>
            <strong>Review now</strong>
          </Link>
        )}

        {/* Hero Metric */}
        <div className={`hero-metric ${isFlashing ? "flash" : ""}`}>
          <div className="hero-label">Net Profit Impact</div>
          <div className="hero-value">{fmt(netProfit)}</div>
          <span className="hero-trend">Up this month</span>
        </div>

        <div className="ops-grid">
          <div className="ops-card">
            <div className="ops-card-header">
              <span>Customer Signals</span>
              <strong>Last 7 days</strong>
            </div>
            <div className="signal-grid">
              <SignalMetric label="Customers known" value={customerSignals.customers} />
              <SignalMetric label="Search intents" value={customerSignals.searches7d} />
              <SignalMetric label="Abandoned carts" value={customerSignals.abandonedCarts7d} />
              <SignalMetric label="Recovered carts" value={customerSignals.recoveredCarts7d} />
            </div>
          </div>

          <div className="ops-card">
            <div className="ops-card-header">
              <span>Worker Health</span>
              <strong className={queueHealth.failed > 0 ? "danger-text" : ""}>{queueHealth.status}</strong>
            </div>
            <div className="signal-grid">
              <SignalMetric label="Pending jobs" value={queueHealth.pending} />
              <SignalMetric label="Processing" value={queueHealth.processing} />
              <SignalMetric label="Done today" value={queueHealth.completedToday} />
              <SignalMetric label="Failed" value={queueHealth.failed} tone={queueHealth.failed > 0 ? "danger" : "normal"} />
            </div>
          </div>
        </div>

        {/* Agent Status */}
        {overview?.agents && (
          <div className="agents-grid">
            {overview.agents.map((a: any) => (
              <div className="agent-card" key={a.name}>
                <div className="agent-card-header">
                  <span className="agent-card-emoji">{a.emoji}</span>
                  <span className="agent-card-name">{a.display_name}</span>
                  <div className="agent-card-status" />
                </div>
                <div className="agent-card-metric">{a.today_actions}</div>
                <div className="agent-card-label">actions today</div>
              </div>
            ))}
          </div>
        )}

        {/* Activity Feed */}
        <div className="feed-section">
          <h2 className="section-title">Live Activity</h2>
          <div className="feed-list">
            {feedItems.length === 0 ? (
              <div className="feed-empty">No activity yet. Your agents are standing by.</div>
            ) : feedItems.map((item: any) => {
              const d = toPlain(item);
              return (
                <div className="feed-item" key={item.id}>
                  <div className={`feed-dot ${d.dot}`} />
                  {d.amt && <span className="feed-amount">{d.amt}</span>}
                  <span className="feed-text">{d.text}</span>
                  <span className="feed-time">{timeAgo(item.time)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Battery Inventory */}
        <div className="inventory-section">
          <h2 className="section-title">Inventory Watch</h2>
          <div className="inventory-grid">
            {inventory.map((item: any, i: number) => {
              const p = battPct(item.stock, item.maxStock);
              const c = battCls(p);
              return (
                <div className={`inventory-item ${p <= 10 ? "critical" : ""}`} key={i}>
                  <div className="battery">
                    <div className={`battery-fill ${c}`} style={{ width: `${Math.max(p, 5)}%` }} />
                  </div>
                  <div className="inventory-info">
                    <div className="inventory-name">{item.name}</div>
                    <div className={`inventory-stock ${p <= 10 ? "critical" : ""}`}>{item.stock} units ({p}%)</div>
                  </div>
                  {p <= 10 && <button className="restock-btn">Restock Action Required</button>}
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

function DemoDataPanel({ demoStatus }: { demoStatus: string | null }) {
  return (
    <div className="demo-data-panel">
      <div>
        <span className="readiness-label">Customer demo data</span>
        <strong>Make the app look alive in one click</strong>
        <p>
          Adds sample COGS, customer signals, carts, approvals, jobs, and revenue impact.
          Clear removes only ANOTAI demo rows.
        </p>
        {demoStatus === "seeded" && <p className="demo-data-result">Sample demo data loaded.</p>}
        {demoStatus === "cleared" && <p className="demo-data-result">Sample demo data cleared.</p>}
        {demoStatus === "store_sync_failed" && (
          <p className="demo-data-result error">Store connection was slow. Refresh and try again.</p>
        )}
        {demoStatus === "seed_failed" && (
          <p className="demo-data-result error">Sample data could not be loaded. Existing demo data is still safe.</p>
        )}
      </div>
      <div className="demo-data-actions">
        <Form action="/app/demo-data" method="post">
          <input type="hidden" name="intent" value="seed" />
          <button type="submit">Load sample data</button>
        </Form>
        <Form action="/app/demo-data" method="post">
          <input type="hidden" name="intent" value="clear" />
          <button type="submit" className="secondary">Clear sample</button>
        </Form>
      </div>
    </div>
  );
}

function LaunchChecklist({
  readiness,
  billingActive,
}: {
  readiness: { readyCount: number; totalCount: number; items: Array<{ key: string; title: string; status: string; detail: string; href?: string }> };
  billingActive: boolean;
}) {
  const importantItems = [
    {
      key: "billing",
      title: "Founder beta billing",
      status: billingActive ? "ready" : "manual",
      detail: billingActive
        ? "Shopify subscription is active."
        : "Use Shopify Billing test mode for dev stores, then switch live for paid customers.",
      href: "/app/billing",
    },
    ...readiness.items.filter((item) =>
      ["privacy_webhooks", "legal", "safety", "cogs", "pixel", "queue", "email"].includes(item.key)
    ),
  ].slice(0, 6);

  return (
    <div className="launch-checklist">
      <div className="launch-checklist-header">
        <div>
          <span className="readiness-label">Reviewer-safe setup</span>
          <strong>{readiness.readyCount}/{readiness.totalCount || 7} ready</strong>
        </div>
        <Link to="/app/onboarding">Full checklist</Link>
      </div>
      <div className="launch-checklist-grid">
        {importantItems.map((item) => (
          <Link to={item.href || "/app/onboarding"} className="launch-check-item" key={item.key}>
            <span className={`launch-status ${item.status}`} />
            <div>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function SignalMetric({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: number;
  tone?: "normal" | "danger";
}) {
  return (
    <div className={`signal-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value.toLocaleString("en-US")}</strong>
    </div>
  );
}

const approvalBannerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  background: "#FEF3C7",
  color: "#92400E",
  border: "1px solid #F59E0B",
  borderRadius: 8,
  padding: "12px 16px",
  marginBottom: 24,
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 800,
};

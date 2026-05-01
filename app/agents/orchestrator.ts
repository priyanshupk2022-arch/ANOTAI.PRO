/**
 * 🧠 ORCHESTRATOR — Central Agent Coordinator
 * 
 * Routes tasks to the correct agent, manages agent lifecycle,
 * and provides unified status reporting.
 * 
 * 4 Core Microservices (Autonomous Revenue Flywheel):
 * 1. 🛡️ Margin Guardian — Financial firewall
 * 2. 🛍️ AI Personal Shopper — AOV booster
 * 3. 🎯 Cart Sniper — Abandonment recovery
 * 4. 🔮 Retention & Intent Engine — Post-purchase retargeting
 */

import { getSniperMetrics, processScheduledRecoveries } from "./cart-sniper";
import { getShopperMetrics } from "./personal-shopper";
import { getMarginReport } from "./margin-guardian";
import { getIntentMetrics } from "./retention-engine";
import { supabase } from "~/utils/supabase.server";

export type AgentName =
  | "personal_shopper"
  | "cart_sniper"
  | "margin_guardian"
  | "retention_engine"
  | "revenue_analyst";

export interface AgentStatus {
  name: AgentName;
  display_name: string;
  emoji: string;
  color: string;
  status: "active" | "idle" | "error";
  today_actions: number;
  revenue_impact: number;
}

/**
 * Get current status of all 4 agents.
 */
export async function getAgentStatuses(storeId: string): Promise<AgentStatus[]> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const since = todayStart.toISOString();

  const { data: actions } = await supabase
    .from("agent_actions")
    .select("agent_name, revenue_impact")
    .eq("store_id", storeId)
    .gte("created_at", since);

  const agentMap: Record<AgentName, { count: number; revenue: number }> = {
    margin_guardian: { count: 0, revenue: 0 },
    personal_shopper: { count: 0, revenue: 0 },
    cart_sniper: { count: 0, revenue: 0 },
    retention_engine: { count: 0, revenue: 0 },
    revenue_analyst: { count: 0, revenue: 0 },
  };

  actions?.forEach((a) => {
    const name = a.agent_name as AgentName;
    if (agentMap[name]) {
      agentMap[name].count++;
      agentMap[name].revenue += a.revenue_impact || 0;
    }
  });

  return [
    {
      name: "margin_guardian",
      display_name: "Margin Guardian",
      emoji: "🛡️",
      color: "#10B981",
      status: "active",
      today_actions: agentMap.margin_guardian.count,
      revenue_impact: agentMap.margin_guardian.revenue,
    },
    {
      name: "personal_shopper",
      display_name: "AI Personal Shopper",
      emoji: "🛍️",
      color: "#8B5CF6",
      status: "active",
      today_actions: agentMap.personal_shopper.count,
      revenue_impact: agentMap.personal_shopper.revenue,
    },
    {
      name: "cart_sniper",
      display_name: "Cart Sniper",
      emoji: "🎯",
      color: "#F59E0B",
      status: "active",
      today_actions: agentMap.cart_sniper.count,
      revenue_impact: agentMap.cart_sniper.revenue,
    },
    {
      name: "retention_engine",
      display_name: "Retention & Intent Engine",
      emoji: "🔮",
      color: "#EC4899",
      status: "active",
      today_actions: agentMap.retention_engine.count,
      revenue_impact: agentMap.retention_engine.revenue,
    },
    {
      name: "revenue_analyst",
      display_name: "Revenue Analyst",
      emoji: "RA",
      color: "#0F172A",
      status: "active",
      today_actions: agentMap.revenue_analyst.count,
      revenue_impact: agentMap.revenue_analyst.revenue,
    },
  ];
}

/**
 * Get full dashboard overview data.
 */
export async function getDashboardOverview(storeId: string) {
  const [agentStatuses, sniperMetrics, shopperMetrics, marginReport, intentMetrics] = await Promise.all([
    getAgentStatuses(storeId),
    getSniperMetrics(storeId),
    getShopperMetrics(storeId),
    getMarginReport(storeId),
    getIntentMetrics(storeId),
  ]);

  const totalRevenueImpact = sniperMetrics.revenue_recovered + shopperMetrics.revenue_generated;

  return {
    agents: agentStatuses,
    metrics: {
      total_revenue_impact: totalRevenueImpact,
      revenue_recovered: sniperMetrics.revenue_recovered,
      aov_increase_pct: shopperMetrics.acceptance_rate,
      intents_captured: intentMetrics.total_intents_captured,
      vip_emails_sent: intentMetrics.targeted_emails_sent,
      margin_loss: 0,
    },
    sniper: sniperMetrics,
    shopper: shopperMetrics,
    guardian: marginReport,
    intent: intentMetrics,
  };
}

/**
 * Get recent activity feed for the dashboard.
 */
export async function getActivityFeed(storeId: string, limit = 20) {
  const { data } = await supabase
    .from("agent_actions")
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data || []).map((action) => ({
    id: action.id,
    agent: action.agent_name,
    type: action.action_type,
    payload: action.payload,
    status: action.status,
    revenue: action.revenue_impact,
    time: action.created_at,
  }));
}

/**
 * Process all scheduled agent tasks (called by cron).
 */
export async function processScheduledTasks(storeId: string) {
  return processScheduledRecoveries(storeId);
}

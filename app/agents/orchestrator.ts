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
import { AGENT_PROFILES } from "./profiles";
import type { AgentMode, AgentName } from "./profiles";
import { getOwnerControls } from "~/services/agent-controls.server";
import { supabase } from "~/utils/supabase.server";

export interface AgentStatus {
  name: AgentName;
  display_name: string;
  emoji: string;
  color: string;
  status: "active" | "idle" | "error";
  mode: AgentMode;
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

  const [{ data: actions }, controls] = await Promise.all([
    supabase
      .from("agent_actions")
      .select("agent_name, revenue_impact")
      .eq("store_id", storeId)
      .gte("created_at", since),
    getOwnerControls(storeId),
  ]);

  const agentMap: Record<AgentName, { count: number; revenue: number }> = {
    margin_guardian: { count: 0, revenue: 0 },
    personal_shopper: { count: 0, revenue: 0 },
    cart_sniper: { count: 0, revenue: 0 },
    retention_engine: { count: 0, revenue: 0 },
    revenue_analyst: { count: 0, revenue: 0 },
  };

  actions?.forEach((action) => {
    const name = action.agent_name as AgentName;
    if (agentMap[name]) {
      agentMap[name].count++;
      agentMap[name].revenue += Number(action.revenue_impact) || 0;
    }
  });

  const colors: Record<AgentName, string> = {
    margin_guardian: "#10B981",
    personal_shopper: "#8B5CF6",
    cart_sniper: "#F59E0B",
    retention_engine: "#EC4899",
    revenue_analyst: "#0F172A",
  };

  return AGENT_PROFILES.map((profile) => {
    const mode = controls.agentModes[profile.name];

    return {
      name: profile.name,
      display_name: profile.displayName,
      emoji: profile.initials,
      color: colors[profile.name],
      status: mode === "locked" ? "idle" : "active",
      mode,
      today_actions: agentMap[profile.name].count,
      revenue_impact: agentMap[profile.name].revenue,
    };
  });
}

/**
 * Get full dashboard overview data.
 */
export async function getDashboardOverview(storeId: string) {
  const [agentStatuses, sniperMetrics, shopperMetrics, marginReport, intentMetrics] =
    await Promise.all([
      getAgentStatuses(storeId),
      getSniperMetrics(storeId),
      getShopperMetrics(storeId),
      getMarginReport(storeId),
      getIntentMetrics(storeId),
    ]);

  const totalRevenueImpact = (sniperMetrics.revenue_recovered || 0) + (shopperMetrics.revenue_generated || 0);

  return {
    agents: agentStatuses,
    metrics: {
      total_revenue_impact: totalRevenueImpact,
      revenue_recovered: sniperMetrics.revenue_recovered || 0,
      aov_increase_pct: shopperMetrics.acceptance_rate || 0,
      intents_captured: intentMetrics.total_intents_captured || 0,
      vip_emails_sent: intentMetrics.targeted_emails_sent || 0,
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

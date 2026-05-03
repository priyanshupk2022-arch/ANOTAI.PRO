import { getActivityFeed, getDashboardOverview } from "./orchestrator";
import { getPendingApprovalCount } from "~/services/agent-controls.server";

export type FounderReport = {
  headline: string;
  summary: string;
  wins: string[];
  risks: string[];
  nextActions: string[];
};

export const fallbackFounderReport: FounderReport = {
  headline: "Revenue team is ready for live signals.",
  summary:
    "Connect COGS, web pixel, and billing to let ANOTAI start collecting revenue opportunities.",
  wins: ["5-agent system is configured.", "Owner controls are available."],
  risks: ["Live store events are not connected yet."],
  nextActions: ["Add product COGS.", "Install the web pixel.", "Review agent modes."],
};

export async function getFounderReport(storeId: string): Promise<FounderReport> {
  const [overview, activity, pendingApprovals] = await Promise.all([
    getDashboardOverview(storeId),
    getActivityFeed(storeId, 10),
    getPendingApprovalCount(storeId),
  ]);

  const metrics = overview.metrics;
  const activeAgents = overview.agents.filter((agent) => agent.status === "active").length;
  const lockedAgents = overview.agents.filter((agent) => agent.mode === "locked").length;

  const wins: string[] = [];
  const risks: string[] = [];
  const nextActions: string[] = [];

  if (metrics.total_revenue_impact > 0) {
    wins.push(`Agents created $${metrics.total_revenue_impact.toLocaleString()} in tracked impact.`);
  } else {
    nextActions.push("Feed live cart, product, and intent events into ANOTAI.");
  }

  if (metrics.revenue_recovered > 0) {
    wins.push(`Cart Sniper recovered $${metrics.revenue_recovered.toLocaleString()}.`);
  } else {
    nextActions.push("Enable abandoned cart tracking before turning Cart Sniper to Auto.");
  }

  if (metrics.intents_captured > 0) {
    wins.push(`${metrics.intents_captured.toLocaleString()} customer intents captured.`);
  } else {
    nextActions.push("Install the web pixel so Retention Engine can collect search intent.");
  }

  if (pendingApprovals > 0) {
    risks.push(`${pendingApprovals} action${pendingApprovals === 1 ? "" : "s"} waiting for owner approval.`);
    nextActions.push("Review the Approval Queue.");
  }

  if (lockedAgents > 0) {
    risks.push(`${lockedAgents} agent${lockedAgents === 1 ? "" : "s"} locked by owner controls.`);
  }

  if (activity.length === 0) {
    risks.push("No live agent activity has been recorded yet.");
  }

  if (wins.length === 0) {
    wins.push(`${activeAgents} agents are configured and ready.`);
  }

  if (risks.length === 0) {
    risks.push("No critical risks detected in the current snapshot.");
  }

  if (nextActions.length === 0) {
    nextActions.push("Keep monitoring approvals and revenue impact.");
  }

  return {
    headline: buildHeadline(metrics.total_revenue_impact, pendingApprovals),
    summary:
      "Revenue Analyst reviewed agent status, recent activity, approvals, and revenue impact for this store.",
    wins: wins.slice(0, 4),
    risks: risks.slice(0, 4),
    nextActions: nextActions.slice(0, 4),
  };
}

function buildHeadline(totalImpact: number, pendingApprovals: number) {
  if (pendingApprovals > 0) {
    return `${pendingApprovals} owner decision${pendingApprovals === 1 ? "" : "s"} needed.`;
  }

  if (totalImpact > 0) {
    return `$${totalImpact.toLocaleString()} tracked impact from your AI revenue team.`;
  }

  return "Revenue team is ready for live store data.";
}

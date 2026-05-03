import { supabase } from "~/utils/supabase.server";
import { checkPlanLimits } from "./usageTracker.server";

export async function routeEvent(storeId: string, eventType: string, payload: any) {
  const limits = await checkPlanLimits(storeId);
  
  if (!limits.canRunAi) {
    return {
      mode: "fast",
      workflowType: "fallback",
      error: "AI interaction limit reached for this billing cycle."
    };
  }

  // Determine Mode based on Event Type
  let mode: "fast" | "smart" | "war_room" = "smart";
  let workflowType = "standard";
  let targetAgents: string[] = [];

  switch (eventType) {
    case "chat":
      mode = "smart";
      workflowType = "skincare_consultation";
      targetAgents = ["sales_agent", "inventory_agent"];
      break;

    case "discount_request":
      mode = limits.canUseWarRoom ? "war_room" : "smart";
      workflowType = "discount_negotiation";
      targetAgents = ["sales_agent", "margin_guardian", "finance_agent"];
      break;

    case "abandoned_cart":
      mode = "smart";
      workflowType = "cart_recovery";
      targetAgents = ["cart_agent", "copy_agent", "email_agent", "inventory_agent"];
      break;

    case "order_status":
      mode = "fast";
      workflowType = "order_tracking";
      targetAgents = ["support_agent", "fulfillment_agent"];
      break;

    case "refund_request":
      mode = limits.canUseWarRoom ? "war_room" : "smart";
      workflowType = "refund_handling";
      targetAgents = ["support_agent", "finance_agent", "margin_guardian"];
      break;

    case "daily_report":
      mode = "smart";
      workflowType = "reporting";
      targetAgents = ["analytics_agent", "finance_agent", "strategy_agent"];
      break;

    default:
      mode = "fast";
      workflowType = "unknown";
      targetAgents = ["support_agent"];
  }

  return { mode, workflowType, targetAgents };
}

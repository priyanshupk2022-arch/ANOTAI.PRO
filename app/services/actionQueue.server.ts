import { supabase } from "~/utils/supabase.server";
import { sendEmail } from "./email.server";
import { assertCanAutoExecute } from "~/services/killSwitch.server";
import { ErrorLogger } from "~/services/errorLogger.server";

export async function createActionQueueItem({
  storeId,
  eventId,
  workflowId,
  proposedBy,
  actionType,
  actionPayload,
  riskLevel,
  requiresApproval
}: {
  storeId: string;
  eventId?: string;
  workflowId?: string;
  proposedBy: string;
  actionType: string;
  actionPayload: any;
  riskLevel: "low" | "medium" | "high" | "critical";
  requiresApproval: boolean;
}) {
  const { data, error } = await supabase.from("action_queue").insert({
    store_id: storeId,
    event_id: eventId,
    workflow_id: workflowId,
    proposed_by_agent: proposedBy,
    action_type: actionType,
    action_payload: actionPayload,
    risk_level: riskLevel,
    requires_approval: requiresApproval,
    status: requiresApproval ? "pending" : "approved"
  }).select().single();
  
  if (error) console.error("Error creating action queue item:", error);
  return data;
}

export async function getPendingActions(storeId: string) {
  const { data } = await supabase.from("action_queue")
    .select("*")
    .eq("store_id", storeId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  return data || [];
}

export async function getActionById(storeId: string, actionId: string) {
  const { data } = await supabase.from("action_queue")
    .select("*")
    .eq("id", actionId)
    .eq("store_id", storeId)
    .single();
  return data;
}

export async function approveAction(storeId: string, actionId: string, approvedBy: string) {
  const action = await getActionById(storeId, actionId);
  if (!action || action.status !== "pending") {
    throw new Error("Action not found or already processed.");
  }

  const { error } = await supabase.from("action_queue").update({
    status: "approved",
    approved_by: approvedBy,
    approved_at: new Date().toISOString()
  }).eq("id", actionId);

  if (error) throw error;

  // Trigger execution for safe action types
  return await executeApprovedAction(storeId, actionId);
}

export async function rejectAction(storeId: string, actionId: string, rejectedBy: string, reason: string = "") {
  const { error } = await supabase.from("action_queue").update({
    status: "rejected",
    result: { rejected_by: rejectedBy, rejection_reason: reason },
    executed_at: new Date().toISOString()
  }).eq("id", actionId).eq("store_id", storeId);

  if (error) throw error;
  return { success: true };
}

export async function executeApprovedAction(storeId: string, actionId: string) {
  const action = await getActionById(storeId, actionId);
  if (!action || action.status !== "approved") return;

  const payload = action.action_payload || {};
  const type = action.action_type;

  // 0. Kill switch: check before any auto-execution
  try {
    await assertCanAutoExecute(storeId);
  } catch (err: any) {
    await ErrorLogger.actionExecution(storeId, type, err.message);
    return await markActionFailed(actionId, err.message);
  }

  // 1. Re-validate Safety for sensitive actions (discounts/shipping)
  if (type === "propose_alternative" || type === "send_margin_safe_discount_reply" || type === "send_free_shipping_offer") {
    const isSafe = payload.alternative_offer_safe !== false && 
                   payload.free_shipping_margin_safe !== false && 
                   (payload.final_estimated_margin === undefined || payload.final_estimated_margin >= 20);
    
    if (!isSafe) {
      return await markActionFailed(actionId, "Safety re-validation failed. Margin impact too high or shipping cost unknown.");
    }
  }

  // 2. Dangerous Action Filter (Skip auto-execution)
  const dangerousTypes = ["price_change", "refund", "bulk_email_campaign", "theme_code_change", "ad_budget_change", "app_install", "storewide_discount"];
  if (dangerousTypes.includes(type)) {
    return { status: "manual_required", message: "Dangerous action type requires manual execution." };
  }

  // 3. Execute Safe Actions (with Duplicate Protection)
  try {
    // ATOMIC LOCK: Try to mark as executed BEFORE side effects
    const { data: lockData, error: lockError } = await supabase
      .from("action_queue")
      .update({ 
        status: "executed", 
        executed_at: new Date().toISOString() 
      })
      .eq("id", actionId)
      .eq("status", "approved") // Crucial: only if still approved
      .select();

    if (lockError || !lockData || lockData.length === 0) {
      console.log(`[DUPLICATE_PREVENTION] Action ${actionId} already executing or processed. Skipping.`);
      return { status: "skipped", message: "Action already processed or locked." };
    }

    if (type === "send_recovery_email" || type === "propose_alternative" || type === "send_margin_safe_discount_reply" || type === "send_free_shipping_offer") {
      const result = await sendEmail({
        to: payload.customer_email || "",
        subject: payload.email_subject || "Exclusive Offer from our Store",
        html: payload.email_body || `<p>Hello, we have a special offer for you: ${payload.alternative_offer_value || 'Free Shipping'}</p>`
      }, storeId);

      if (result.status === "sent") {
        // Already marked as executed, just update result
        return await updateActionResult(actionId, { ...result, customer_message_status: "sent" });
      } else {
        await ErrorLogger.actionExecution(storeId, type, result.error || "Email delivery failed.");
        return await markActionFailed(actionId, result.error || "Email delivery failed.");
      }
    }

    if (type === "mark_task_completed") {
      return await updateActionResult(actionId, { success: true });
    }

    return await updateActionResult(actionId, { success: true, note: "Generic execution completed." });

  } catch (error: any) {
    await ErrorLogger.actionExecution(storeId, type, error);
    return await markActionFailed(actionId, error.message);
  }
}

export async function updateActionResult(actionId: string, resultData: any) {
  const { data } = await supabase.from("action_queue").update({
    result: resultData
  }).eq("id", actionId).select().single();
  return data;
}

export async function markActionExecuted(actionId: string, resultData: any) {
  const { data } = await supabase.from("action_queue").update({
    status: "executed",
    executed_at: new Date().toISOString(),
    result: resultData
  }).eq("id", actionId).select().single();
  return data;
}

export async function markActionFailed(actionId: string, errorMessage: string) {
  const { data } = await supabase.from("action_queue").update({
    status: "failed",
    error_message: errorMessage,
    executed_at: new Date().toISOString()
  }).eq("id", actionId).select().single();
  return data;
}

export async function executeAction(actionId: string, resultData: any) {
  return await markActionExecuted(actionId, resultData);
}

export async function failAction(actionId: string, errorMessage: string) {
  return await markActionFailed(actionId, errorMessage);
}

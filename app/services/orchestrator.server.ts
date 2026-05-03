import { supabase } from "~/utils/supabase.server";
import { getAvailableAgents, getAgentByKey, getAgentHierarchy } from "./agentRegistry.server";
import { createActionQueueItem, executeAction } from "./actionQueue.server";
import { routeEvent } from "./intentRouter.server";
import { trackAiUsage } from "./usageTracker.server";
import { 
  runPersonalShopperWrapper, 
  runCartSniperWrapper, 
  runMarginGuardianWrapper,
  runRetentionEngineWrapper
} from "./agentWrappers.server";

// ============================================
// NEW HIERARCHICAL ORCHESTRATOR
// ============================================

function selectDepartmentManager(eventType: string) {
  switch (eventType) {
    case "abandoned_cart":
    case "chat":
    case "discount_request":
    case "product_recommendation":
      return "sales_agent"; // Revenue Manager
    case "order_status":
    case "refund_request":
      return "inventory_agent"; // Operations Manager
    case "low_conversion":
      return "copy_agent"; // Creative Manager
    case "daily_report":
      return "margin_guardian"; // Finance Manager
    default:
      return "sales_agent";
  }
}

function selectSpecialists(eventType: string) {
  switch (eventType) {
    case "abandoned_cart":
      return ["cart_agent", "email_agent"];
    case "chat":
    case "product_recommendation":
      return ["personal_shopper"];
    case "discount_request":
      return ["margin_guardian"]; // Finance agent not wrapped yet, just MG
    case "order_status":
      return ["fulfillment_agent", "support_agent"];
    case "refund_request":
      return ["support_agent", "margin_guardian"];
    default:
      return [];
  }
}

function shouldEscalateToCEO(eventType: string, riskScore: number, payload: any) {
  if (riskScore > 50) return true;
  if (payload.cart_value && payload.cart_value > 250) return true;
  if (payload.discount_requested && payload.discount_requested > 15) return true;
  if (payload.refund_amount && payload.refund_amount > 100) return true;
  if (["campaign_planning", "pricing_strategy", "storewide_discount"].includes(eventType)) return true;
  return false;
}

async function executeHierarchicalWorkflow(storeId: string, eventId: string, eventType: string, payload: any) {
  // 1. Route Event (Still use Intent Router for limits and mode)
  const { mode, workflowType, targetAgents, error } = await routeEvent(storeId, eventType, payload);
  if (error) return { success: false, error };

  // 2. Select Hierarchy
  const managerKey = selectDepartmentManager(eventType);
  let specialistKeys = selectSpecialists(eventType);
  
  // Margin Guardian rule: MUST be included if discount or refund
  if ((eventType === "discount_request" || eventType === "refund_request" || payload.discount_requested) && !specialistKeys.includes("margin_guardian")) {
      specialistKeys.push("margin_guardian");
  }

  // Cost control / Plan limits
  if (mode === "fast") specialistKeys = specialistKeys.slice(0, 1);
  if (mode === "smart") specialistKeys = specialistKeys.slice(0, 3);
  if (mode === "war_room") specialistKeys = specialistKeys.slice(0, 6);

  // 3. Create Workflow Record
  const { data: workflow } = await supabase.from("agent_workflows").insert({
    store_id: storeId,
    event_id: eventId,
    workflow_type: workflowType,
    mode: mode,
    status: "running"
  }).select().single();

  if (!workflow) throw new Error("Failed to create workflow");

  // Load Agents
  const hierarchy = await getAgentHierarchy(storeId);
  const manager = [hierarchy.ceo, ...hierarchy.managers].find(m => m?.key === managerKey);
  const availableSpecialists = hierarchy.managers.flatMap(m => m.specialists || []);
  const activeSpecialists = specialistKeys.map(key => availableSpecialists.find(s => s.key === key)).filter(Boolean);
  
  // 4. Create Manager Task
  let managerTask;
  if (manager) {
    const { data: t } = await supabase.from("agent_tasks").insert({
      store_id: storeId,
      workflow_id: workflow.id,
      assigned_to_agent_id: manager.id,
      task_type: "review_event",
      status: "running"
    }).select().single();
    managerTask = t;
  }

  // 5. Run Specialists
  const recommendations = [];
  let highestRisk = 0;
  let requiresApproval = false;
  let marginGuardianBlocked = false;

  for (const agent of activeSpecialists) {
    if (!agent) continue;

    // Create Specialist Task
    const { data: specTask } = await supabase.from("agent_tasks").insert({
      store_id: storeId,
      workflow_id: workflow.id,
      assigned_by_agent_id: manager?.id,
      assigned_to_agent_id: agent.id,
      task_type: "process_specialist_action",
      status: "running"
    }).select().single();

    let result = null;
    let inputTokens = 0;
    let outputTokens = 0;

    // Wrappers map
    if (agent.key === "personal_shopper" || agent.key === "sales_agent") {
      result = await runPersonalShopperWrapper(storeId, payload.email || "", payload.message || "", payload.catalog || []);
      inputTokens = 150; outputTokens = 200;
    } else if (agent.key === "cart_agent" || agent.key === "cart_sniper") {
      result = await runCartSniperWrapper(storeId, payload.cartEventId || "");
      inputTokens = 100; outputTokens = 100;
    } else if (agent.key === "email_agent" || agent.key === "retention_agent") {
      result = await runRetentionEngineWrapper(storeId, payload.email || "");
      inputTokens = 50; outputTokens = 150;
    } else if (agent.key === "margin_guardian") {
      const discount = payload.discount_requested || (recommendations.find(r => (r.result as any).requested_action?.payload?.discount)?.result as any).requested_action.payload.discount.pct || 0;
      result = await runMarginGuardianWrapper(storeId, payload.variantIds || [], payload.prices || {}, discount);
      inputTokens = 50; outputTokens = 50;
      if (result.requested_action?.type === "propose_alternative") {
         // If alternative is NOT allowed to auto-reply, we treat it as blocked and force approval
         marginGuardianBlocked = !result.requested_action.payload.auto_reply_allowed;
         if (marginGuardianBlocked) {
             highestRisk = 100;
         }
      }
    }

    if (result && specTask) {
      recommendations.push({ agent, result });
      highestRisk = Math.max(highestRisk, result.risk_score);
      if (agent.permission_level === "suggest_only" || agent.permission_level === "draft_action") requiresApproval = true;

      // Update Task (Concise summary, no raw thought process)
      await supabase.from("agent_tasks").update({
        status: "completed",
        result_summary: `Agent recommended: ${result.requested_action?.type || "no_action"}. Risk: ${result.risk_score}`,
        confidence_score: result.confidence_score,
        risk_score: result.risk_score,
        completed_at: new Date().toISOString()
      }).eq("id", specTask.id);

      // Track Usage
      await trackAiUsage({
        storeId, eventId, agentId: agent.id, workflowId: workflow.id,
        model: "gemini-1.5-pro", inputTokens, outputTokens,
        cost: (inputTokens * 0.000001) + (outputTokens * 0.000002),
        mode: mode as any
      });
    }
  }

  // 6. Escalation to CEO
  let finalDecisionAction = recommendations[0]?.result?.requested_action;
  let ceoTask;
  const escalated = shouldEscalateToCEO(eventType, highestRisk, payload) && mode !== "fast";

  if (escalated && hierarchy.ceo) {
    const { data: t } = await supabase.from("agent_tasks").insert({
      store_id: storeId,
      workflow_id: workflow.id,
      assigned_to_agent_id: hierarchy.ceo.id,
      task_type: "executive_review",
      status: "running"
    }).select().single();
    ceoTask = t;
    
    // CEO logic (simulated for wrapper constraints)
    requiresApproval = true;
    
    await supabase.from("agent_tasks").update({
      status: "completed",
      result_summary: marginGuardianBlocked ? "CEO concurs with Margin Guardian rejection." : "CEO reviewed and approved high-risk workflow.",
      confidence_score: 95,
      risk_score: highestRisk,
      completed_at: new Date().toISOString()
    }).eq("id", t.id);
  }

  // Finalize Manager Task
  if (managerTask) {
    await supabase.from("agent_tasks").update({
      status: "completed",
      result_summary: `Manager coordinated ${activeSpecialists.length} specialists. Escalated: ${escalated}`,
      confidence_score: 90,
      risk_score: highestRisk,
      completed_at: new Date().toISOString()
    }).eq("id", managerTask.id);
  }

  // 7. Action Queue
  const riskLabel = highestRisk > 75 ? "high" : highestRisk > 50 ? "medium" : "low";
  const finalRequiresApproval = requiresApproval || highestRisk > 50 || marginGuardianBlocked;

  if (finalDecisionAction && !marginGuardianBlocked) {
    const queueItem = await createActionQueueItem({
      storeId,
      eventId,
      workflowId: workflow.id, 
      proposedBy: manager?.name || "Orchestrator",
      actionType: finalDecisionAction.type,
      actionPayload: finalDecisionAction.payload,
      riskLevel: riskLabel as any,
      requiresApproval: finalRequiresApproval
    });

    if (!finalRequiresApproval && queueItem) {
      await executeAction(queueItem.id, { result: "Auto-executed successfully by Hierarchical Workflow" });
    }
  }

  // Close workflow
  await supabase.from("agent_workflows").update({
    status: "completed",
    risk_level: riskLabel,
    updated_at: new Date().toISOString()
  }).eq("id", workflow.id);

  return { success: true, workflowId: workflow.id, hierarchical: true };
}

// ============================================
// EXISTING FLAT ORCHESTRATOR (FALLBACK)
// ============================================

async function executeFlatWorkflow(storeId: string, eventId: string, eventType: string, payload: any) {
  // 1. Route the event
  const { mode, workflowType, targetAgents, error } = await routeEvent(storeId, eventType, payload);
  if (error) return { success: false, error };

  // 2. Start Thread
  const { data: thread } = await supabase.from("agent_threads").insert({
    store_id: storeId,
    event_id: eventId,
    workflow_type: workflowType,
    status: "in_progress"
  }).select().single();

  if (!thread) throw new Error("Failed to create thread");

  // 3. Load Available Agents
  const availableAgents = await getAvailableAgents(storeId);
  const activeAgentKeys = (targetAgents || []).filter(key => availableAgents.some(a => a.key === key));

  // 4. Collect Agent Recommendations
  const recommendations = [];
  let highestRisk = 0;
  let requiresApproval = false;
  let requiresMarginCheck = false;
  let discountRequested = 0;

  for (const agentKey of activeAgentKeys) {
    const agent = availableAgents.find(a => a.key === agentKey);
    if (!agent) continue;

    let result = null;
    let inputTokens = 0;
    let outputTokens = 0;
    
    // Call appropriate wrapper based on agent
    if (agentKey === "sales_agent" || agentKey === "personal_shopper") {
      result = await runPersonalShopperWrapper(storeId, payload.email || "", payload.message || "", payload.catalog || []);
      if ((result as any).requested_action.payload?.discount) {
        requiresMarginCheck = true;
        discountRequested = (result as any).requested_action.payload.discount.pct;
      }
      inputTokens = 150; outputTokens = 200; 
    } else if (agentKey === "cart_agent" || agentKey === "cart_sniper") {
      result = await runCartSniperWrapper(storeId, payload.cartEventId);
      inputTokens = 100; outputTokens = 100;
    } else if (agentKey === "email_agent" || agentKey === "retention_agent") {
      result = await runRetentionEngineWrapper(storeId, payload.email || "");
      inputTokens = 50; outputTokens = 150;
    }

    if (result) {
      recommendations.push({ agent, result });
      highestRisk = Math.max(highestRisk, result.risk_score);
      if (agent.permission_level === "suggest_only" || agent.permission_level === "draft_action") {
        requiresApproval = true;
      }

      // Log Message
      await supabase.from("agent_messages").insert({
        thread_id: thread.id,
        agent_id: agent.id,
        message_type: "recommendation",
        observation: result.observation,
        recommendation: result.recommendation,
        confidence_score: result.confidence_score,
        risk_score: result.risk_score,
        requested_action: result.requested_action
      });

      // Track Usage
      await trackAiUsage({
        storeId, eventId, agentId: agent.id, workflowId: thread.id,
        model: "gemini-1.5-pro", inputTokens, outputTokens,
        cost: (inputTokens * 0.000001) + (outputTokens * 0.000002), 
        mode: mode as any
      });
    }
  }

  // 5. Margin Guardian Validation (if needed)
  if (requiresMarginCheck && (targetAgents || []).includes("margin_guardian")) {
    const guardian = availableAgents.find(a => a.key === "margin_guardian");
    if (guardian) {
      const gResult = await runMarginGuardianWrapper(storeId, payload.variantIds || [], payload.prices || {}, discountRequested);
      recommendations.push({ agent: guardian, result: gResult });
      
      await supabase.from("agent_messages").insert({
        thread_id: thread.id,
        agent_id: guardian.id,
        message_type: "validation",
        observation: gResult.observation,
        recommendation: gResult.recommendation,
        confidence_score: gResult.confidence_score,
        risk_score: gResult.risk_score,
        requested_action: gResult.requested_action
      });

      if (gResult.requested_action.type === "reject_discount") {
        highestRisk = 100; // Force block
      }
    }
  }

  // 6. Orchestrator Decision
  const primaryAction = recommendations[0]?.result.requested_action;
  const riskLabel = highestRisk > 75 ? "high" : highestRisk > 50 ? "medium" : "low";
  const finalRequiresApproval = requiresApproval || highestRisk > 50;
  
  const decisionSummary = `Orchestrator decided to ${primaryAction ? 'proceed with' : 'skip'} the action. Risk level: ${riskLabel}. Approval needed: ${finalRequiresApproval}`;

  await supabase.from("agent_decisions").insert({
    thread_id: thread.id,
    orchestrator_decision: primaryAction ? primaryAction.type : "no_action",
    selected_action: primaryAction,
    approval_required: finalRequiresApproval,
    reason_summary: decisionSummary
  });

  await supabase.from("agent_threads").update({
    status: "resolved",
    final_decision: primaryAction?.type || "none",
    risk_level: riskLabel
  }).eq("id", thread.id);

  // 7. Action Queue
  if (primaryAction) {
    const queueItem = await createActionQueueItem({
      storeId,
      eventId,
      workflowId: thread.id,
      proposedBy: recommendations[0].agent.name,
      actionType: primaryAction.type,
      actionPayload: primaryAction.payload,
      riskLevel: riskLabel as any,
      requiresApproval: finalRequiresApproval
    });

    if (!finalRequiresApproval && queueItem) {
      // Auto-execute
      await executeAction(queueItem.id, { result: "Auto-executed successfully" });
    }
  }

  return { success: true, threadId: thread.id, hierarchical: false };
}

// ============================================
// ENTRY POINT
// ============================================

export async function processEvent(storeId: string, eventId: string, eventType: string, payload: any) {
  if (process.env.HIERARCHICAL_ORCHESTRATOR_ENABLED === 'true') {
    try {
      console.log(`[Orchestrator] Running Hierarchical Workflow for ${eventType}`);
      return await executeHierarchicalWorkflow(storeId, eventId, eventType, payload);
    } catch (e: any) {
      console.error("[Orchestrator] Hierarchical Mode Failed, falling back to Flat Mode.", e);
      return await executeFlatWorkflow(storeId, eventId, eventType, payload);
    }
  } else {
    console.log(`[Orchestrator] Running Flat Workflow for ${eventType}`);
    return await executeFlatWorkflow(storeId, eventId, eventType, payload);
  }
}

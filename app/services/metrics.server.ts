import { supabase } from "~/utils/supabase.server";

export async function getActivityMetrics(storeId: string, dateRange: string = "30d") {
  // Aggregate tasks and actions
  const { data: tasks } = await supabase.from("agent_tasks")
    .select("status, task_type")
    .eq("store_id", storeId);

  const { data: actions } = await supabase.from("action_queue")
    .select("status, action_type")
    .eq("store_id", storeId);

  const completedTasks = tasks?.filter(t => t.status === "completed").length || 0;
  const executedActions = actions?.filter(a => a.status === "executed").length || 0;
  const emailsSent = actions?.filter(a => a.action_type.includes("email") && a.status === "executed").length || 0;
  const interactions = tasks?.filter(t => t.task_type === "process_specialist_action").length || 0;

  return {
    customer_interactions_handled: interactions,
    cart_recovery_drafts_created: tasks?.filter(t => t.task_type === "review_event" && t.result_summary?.includes("drafted")).length || 0,
    recovery_emails_sent: emailsSent,
    agent_tasks_completed: completedTasks,
    actions_executed: executedActions,
    actions_pending: actions?.filter(a => a.status === "pending").length || 0,
    actions_rejected: actions?.filter(a => a.status === "rejected").length || 0,
    actions_failed: actions?.filter(a => a.status === "failed").length || 0,
  };
}

export async function getOpportunityPipelineMetrics(storeId: string) {
  // Detection of abandoned carts
  const { data: workflows } = await supabase.from("agent_workflows")
    .select("workflow_type, event_payload")
    .eq("store_id", storeId)
    .eq("workflow_type", "abandoned_cart");

  let totalValueDetected = 0;
  workflows?.forEach(wf => {
    try {
      const payload = typeof wf.event_payload === 'string' ? JSON.parse(wf.event_payload) : wf.event_payload;
      const value = payload?.total_price || payload?.cart?.total_price || 0;
      totalValueDetected += Number(value);
    } catch (e) {
      // Ignore malformed payloads
    }
  });

  return {
    abandoned_carts_detected: workflows?.length || 0,
    total_abandoned_cart_value_detected: Math.round(totalValueDetected),
    high_value_carts_detected: workflows?.filter(wf => {
      const payload = typeof wf.event_payload === 'string' ? JSON.parse(wf.event_payload) : wf.event_payload;
      return (payload?.total_price || 0) > 200;
    }).length || 0,
    pending_recovery_actions: 0, // Placeholder for specific count if needed
  };
}

export async function getMarginRiskMetrics(storeId: string) {
  const { data: actions } = await supabase.from("action_queue")
    .select("action_type, action_payload")
    .eq("store_id", storeId);

  const unsafeBlocked = actions?.filter(a => 
    a.action_type === "propose_alternative" && 
    (a.action_payload?.requested_discount_safe === false)
  ).length || 0;

  const { data: cogs } = await supabase.from("product_cogs")
    .select("id")
    .eq("store_id", storeId);

  return {
    unsafe_discounts_blocked: unsafeBlocked,
    unsafe_free_shipping_offers_blocked: actions?.filter(a => 
      a.action_type === "propose_alternative" && 
      a.action_payload?.alternative_offer_type === "free_shipping" &&
      a.action_payload?.free_shipping_margin_safe === false
    ).length || 0,
    margin_risk_actions_blocked: unsafeBlocked,
    missing_cogs_count: 0, // Would need to join with products table to find missing
  };
}

export async function getNextBestActions(storeId: string) {
  const actions: any[] = [];

  // Check Action Queue
  const { data: pending } = await supabase.from("action_queue")
    .select("id")
    .eq("store_id", storeId)
    .eq("status", "pending")
    .limit(5);

  if (pending && pending.length > 0) {
    actions.push({
      title: `Approve ${pending.length} pending actions`,
      reason: "Your AI team has drafted recovery offers waiting for your review.",
      priority: "high",
      impact: "Recovery",
      cta: "Review Queue",
      link: "/app/queue"
    });
  }

  // Check Settings
  const { data: settings } = await supabase.from("merchant_agent_settings")
    .select("allow_auto_free_shipping")
    .eq("store_id", storeId)
    .single();

  if (!settings?.allow_auto_free_shipping) {
    actions.push({
      title: "Enable Auto-Free Shipping",
      reason: "Margin Guardian can auto-send safe free shipping offers if enabled.",
      priority: "medium",
      impact: "Automation",
      cta: "Open Settings",
      link: "/app/settings"
    });
  }

  return actions;
}

export async function getActivationScore(storeId: string) {
  const milestones = [
    { key: "billing_active", weight: 20 },
    { key: "cogs_added", weight: 30 },
    { key: "recovery_enabled", weight: 30 },
    { key: "hierarchy_active", weight: 20 }
  ];

  // Mock logic for score calculation
  return {
    score: 65,
    status: "Active",
    checklist: [
      { label: "Billing & Plan Active", completed: true },
      { label: "Add Product Costs (COGS)", completed: false },
      { label: "Enable Cart Recovery", completed: true },
      { label: "Configure AI Hierarchy", completed: true }
    ]
  };
}

export async function getDepartmentActivityMetrics(storeId: string) {
  const { data: tasks } = await supabase.from("agent_tasks")
    .select("assigned_to_agent_id, agents(department)")
    .eq("store_id", storeId);

  const depts: Record<string, number> = {
    "Revenue": 0,
    "Creative": 0,
    "Operations": 0,
    "Finance & Control": 0
  };

  tasks?.forEach(t => {
    const dept = t.agents?.department;
    if (dept && depts[dept] !== undefined) {
      depts[dept]++;
    }
  });

  return depts;
}

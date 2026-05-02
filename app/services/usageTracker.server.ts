import { supabase } from "~/utils/supabase.server";

export async function trackAiUsage({
  storeId,
  eventId,
  agentId,
  workflowId,
  model,
  inputTokens,
  outputTokens,
  cost,
  plan,
  mode
}: {
  storeId: string;
  eventId?: string;
  agentId?: string;
  workflowId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  plan?: string;
  mode?: "fast" | "smart" | "war_room";
}) {
  await supabase.from("ai_usage_events").insert({
    store_id: storeId,
    event_id: eventId,
    agent_id: agentId,
    workflow_id: workflowId,
    model_used: model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost: cost,
    plan,
    mode
  });

  const billingMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  
  // Upsert monthly counter
  const { data: counter } = await supabase.from("monthly_usage_counters")
    .select("id, ai_interactions_used, estimated_ai_cost")
    .eq("store_id", storeId)
    .eq("billing_month", billingMonth)
    .single();

  if (counter) {
    await supabase.from("monthly_usage_counters")
      .update({
        ai_interactions_used: (counter.ai_interactions_used || 0) + 1,
        estimated_ai_cost: Number(counter.estimated_ai_cost || 0) + cost,
        updated_at: new Date().toISOString()
      })
      .eq("id", counter.id);
  } else {
    await supabase.from("monthly_usage_counters")
      .insert({
        store_id: storeId,
        billing_month: billingMonth,
        ai_interactions_used: 1,
        estimated_ai_cost: cost,
      });
  }
}

export async function checkPlanLimits(storeId: string) {
  const billingMonth = new Date().toISOString().slice(0, 7);
  
  const { data: counter } = await supabase.from("monthly_usage_counters")
    .select("*")
    .eq("store_id", storeId)
    .eq("billing_month", billingMonth)
    .single();

  if (!counter) {
    return { canRunAi: true, canSendEmail: true, canUseWarRoom: true };
  }

  return {
    canRunAi: counter.ai_interactions_used < counter.plan_limit_interactions,
    canSendEmail: counter.recovery_emails_sent < counter.plan_limit_emails,
    canUseWarRoom: counter.war_room_decisions_used < counter.plan_limit_war_room,
  };
}

export async function trackRecoveryEmail(storeId: string) {
  const billingMonth = new Date().toISOString().slice(0, 7);
  const { data: counter } = await supabase.from("monthly_usage_counters")
    .select("id, recovery_emails_sent")
    .eq("store_id", storeId)
    .eq("billing_month", billingMonth)
    .single();

  if (counter) {
    await supabase.from("monthly_usage_counters")
      .update({
        recovery_emails_sent: (counter.recovery_emails_sent || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq("id", counter.id);
  }
}

export async function trackWarRoomUsage(storeId: string) {
  const billingMonth = new Date().toISOString().slice(0, 7);
  const { data: counter } = await supabase.from("monthly_usage_counters")
    .select("id, war_room_decisions_used")
    .eq("store_id", storeId)
    .eq("billing_month", billingMonth)
    .single();

  if (counter) {
    await supabase.from("monthly_usage_counters")
      .update({
        war_room_decisions_used: (counter.war_room_decisions_used || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq("id", counter.id);
  }
}

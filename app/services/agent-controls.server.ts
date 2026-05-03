import { DEFAULT_OWNER_CONTROLS } from "~/agents/profiles";
import type { AgentMode, AgentName, OwnerControls, OwnerSafetySettings, StorePlaybook } from "~/agents/profiles";
import { supabase } from "~/utils/supabase.server";

type StoredSettings = Partial<OwnerControls> | null;

export type AgentDecisionInput = {
  agentName: AgentName;
  discountPct?: number;
  estimatedRevenueImpact?: number;
  emailCount?: number;
};

export type AgentDecision = {
  mode: AgentMode;
  status: "executed" | "pending" | "blocked";
  canExecute: boolean;
  reason: string;
};

export type ApprovalAction = {
  id: string;
  agent_name: AgentName;
  action_type: string;
  payload: Record<string, any>;
  status: "pending" | "approved" | "executed" | "blocked";
  revenue_impact: number;
  created_at: string;
};

export function normalizeOwnerControls(settings: StoredSettings): OwnerControls {
  const agentModes = {
    ...DEFAULT_OWNER_CONTROLS.agentModes,
    ...(settings?.agentModes || {}),
  };

  const safety = {
    ...DEFAULT_OWNER_CONTROLS.safety,
    ...(settings?.safety || {}),
  };

  const playbook = {
    ...DEFAULT_OWNER_CONTROLS.playbook,
    ...(settings?.playbook || {}),
    bestsellerCategories:
      settings?.playbook?.bestsellerCategories ||
      DEFAULT_OWNER_CONTROLS.playbook.bestsellerCategories,
    approvedClaims:
      settings?.playbook?.approvedClaims ||
      DEFAULT_OWNER_CONTROLS.playbook.approvedClaims,
    forbiddenClaims:
      settings?.playbook?.forbiddenClaims ||
      DEFAULT_OWNER_CONTROLS.playbook.forbiddenClaims,
    defaultRoutineSteps:
      settings?.playbook?.defaultRoutineSteps ||
      DEFAULT_OWNER_CONTROLS.playbook.defaultRoutineSteps,
  };

  return { agentModes, safety, playbook };
}

export async function getOwnerControls(storeId: string): Promise<OwnerControls> {
  const { data, error } = await supabase
    .from("stores")
    .select("settings")
    .eq("id", storeId)
    .single();

  if (error || !data) {
    return DEFAULT_OWNER_CONTROLS;
  }

  return normalizeOwnerControls(data.settings as StoredSettings);
}

export async function updateAgentMode(
  storeId: string,
  agentName: AgentName,
  mode: AgentMode
): Promise<OwnerControls> {
  const controls = await getOwnerControls(storeId);
  const nextControls: OwnerControls = {
    ...controls,
    agentModes: {
      ...controls.agentModes,
      [agentName]: mode,
    },
  };

  await updateStoreSettings(storeId, nextControls);
  return nextControls;
}

export async function updateSafetySettings(
  storeId: string,
  safety: Partial<OwnerSafetySettings>
): Promise<OwnerControls> {
  const controls = await getOwnerControls(storeId);
  const nextControls: OwnerControls = {
    ...controls,
    safety: {
      ...controls.safety,
      ...safety,
    },
  };

  await updateStoreSettings(storeId, nextControls);
  return nextControls;
}

export async function updateStorePlaybook(
  storeId: string,
  playbook: Partial<StorePlaybook>
): Promise<OwnerControls> {
  const controls = await getOwnerControls(storeId);
  const nextControls: OwnerControls = {
    ...controls,
    playbook: {
      ...controls.playbook,
      ...playbook,
      shopperMode: "beauty_skincare",
    },
  };

  await updateStoreSettings(storeId, nextControls);
  return nextControls;
}

export async function getPendingApprovals(storeId: string, limit = 25): Promise<ApprovalAction[]> {
  const { data, error } = await supabase
    .from("agent_actions")
    .select("id, agent_name, action_type, payload, status, revenue_impact, created_at")
    .eq("store_id", storeId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data as ApprovalAction[];
}

export async function getRecentApprovalDecisions(storeId: string, limit = 10): Promise<ApprovalAction[]> {
  const { data, error } = await supabase
    .from("agent_actions")
    .select("id, agent_name, action_type, payload, status, revenue_impact, created_at")
    .eq("store_id", storeId)
    .in("status", ["approved", "blocked"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data as ApprovalAction[];
}

export async function getPendingApprovalCount(storeId: string): Promise<number> {
  const { count, error } = await supabase
    .from("agent_actions")
    .select("*", { count: "exact", head: true })
    .eq("store_id", storeId)
    .eq("status", "pending");

  if (error) return 0;
  return count || 0;
}

export async function updateApprovalDecision(
  storeId: string,
  actionId: string,
  decision: "approved" | "blocked"
) {
  const { data: action, error: readError } = await supabase
    .from("agent_actions")
    .select("payload")
    .eq("store_id", storeId)
    .eq("id", actionId)
    .eq("status", "pending")
    .single();

  if (readError || !action) {
    throw new Error("Pending approval action was not found.");
  }

  const payload = {
    ...((action.payload as Record<string, any>) || {}),
    owner_decision: decision,
    owner_decided_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("agent_actions")
    .update({
      status: decision,
      payload,
    })
    .eq("store_id", storeId)
    .eq("id", actionId)
    .eq("status", "pending");

  if (error) {
    throw new Error(`Failed to ${decision} action: ${error.message}`);
  }
}

export function decideAgentAction(
  controls: OwnerControls,
  input: AgentDecisionInput
): AgentDecision {
  const mode = controls.agentModes[input.agentName] || "approval";
  const safety = controls.safety;

  if (mode === "locked") {
    return {
      mode,
      status: "blocked",
      canExecute: false,
      reason: "Agent is locked by the owner.",
    };
  }

  const discountPct = input.discountPct || 0;
  const estimatedRevenueImpact = input.estimatedRevenueImpact || 0;
  const emailCount = input.emailCount || 0;

  if (discountPct > safety.maxDiscountPct) {
    return {
      mode,
      status: "blocked",
      canExecute: false,
      reason: `Discount ${discountPct}% is above owner max ${safety.maxDiscountPct}%.`,
    };
  }

  if (emailCount > safety.dailyEmailLimit) {
    return {
      mode,
      status: "pending",
      canExecute: false,
      reason: `Email count ${emailCount} is above daily owner limit ${safety.dailyEmailLimit}.`,
    };
  }

  if (mode === "approval") {
    return {
      mode,
      status: "pending",
      canExecute: false,
      reason: "Agent is in approval mode.",
    };
  }

  if (discountPct > safety.approvalRequiredAboveDiscountPct) {
    return {
      mode,
      status: "pending",
      canExecute: false,
      reason: `Discount ${discountPct}% requires approval above ${safety.approvalRequiredAboveDiscountPct}%.`,
    };
  }

  if (estimatedRevenueImpact > safety.autoRevenueLimit) {
    return {
      mode,
      status: "pending",
      canExecute: false,
      reason: `Estimated impact $${estimatedRevenueImpact} requires approval above $${safety.autoRevenueLimit}.`,
    };
  }

  return {
    mode,
    status: "executed",
    canExecute: true,
    reason: "Owner auto-mode limits passed.",
  };
}

async function updateStoreSettings(storeId: string, settings: OwnerControls) {
  const { error } = await supabase
    .from("stores")
    .update({
      settings,
      updated_at: new Date().toISOString(),
    })
    .eq("id", storeId);

  if (error) {
    throw new Error(`Failed to update owner controls: ${error.message}`);
  }
}

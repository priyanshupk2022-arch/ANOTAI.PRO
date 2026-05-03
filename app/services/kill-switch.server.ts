/**
 * 🛑 GLOBAL KILL SWITCH SERVICE — Phase 10 Enhanced
 *
 * Kill switches + rate limits + daily limits enforced BEFORE:
 * - Sending any email
 * - Auto-executing any Action Queue item
 * - Running War Room workflows
 * - Sending customer-facing AI replies
 * - Making any AI call
 */

import { supabase } from "~/utils/supabase.server";
import {
  assertGlobalAiCallRate,
  assertGlobalEmailRate,
  assertGlobalAutoExecutionRate,
  assertGlobalWarRoomRate,
  assertStoreDailyAiLimit,
  assertStoreDailyEmailLimit,
  assertStoreDailyExecutionLimit,
} from "~/services/rate-limiter.server";

// -------------------------------------------------------
// GLOBAL KILL SWITCHES (env-controlled, instant override)
// -------------------------------------------------------
function getGlobalFlags() {
  return {
    PAUSE_ALL_AUTO_EXECUTION:    process.env.KILL_SWITCH_AUTO_EXECUTION     === "true",
    PAUSE_ALL_RECOVERY_EMAILS:   process.env.KILL_SWITCH_RECOVERY_EMAILS    === "true",
    DISABLE_WAR_ROOM:            process.env.KILL_SWITCH_WAR_ROOM           === "true",
    FORCE_TEMPLATE_MODE:         process.env.KILL_SWITCH_TEMPLATE_MODE      === "true",
    DISABLE_CUSTOMER_AI_REPLIES: process.env.KILL_SWITCH_CUSTOMER_AI_REPLIES === "true",
  };
}

export function getGlobalKillSwitchStatus() {
  return getGlobalFlags();
}

// -------------------------------------------------------
// STORE-LEVEL SAFETY GATE
// -------------------------------------------------------
export interface StoreSafetyState {
  automation_enabled:            boolean;
  recovery_emails_enabled:       boolean;
  war_room_enabled:              boolean;
  customer_ai_replies_enabled:   boolean;
  auto_discount_replies_enabled: boolean;
  max_daily_ai_interactions:     number;
  max_daily_recovery_emails:     number;
  max_daily_auto_executions:     number;
}

const SAFE_DEFAULTS: StoreSafetyState = {
  automation_enabled:            true,
  recovery_emails_enabled:       true,
  war_room_enabled:              true,
  customer_ai_replies_enabled:   true,
  auto_discount_replies_enabled: false,
  max_daily_ai_interactions:     500,
  max_daily_recovery_emails:     50,
  max_daily_auto_executions:     20,
};

export async function getStoreSafetySettings(storeId: string): Promise<StoreSafetyState> {
  const { data } = await supabase
    .from("merchant_agent_settings")
    .select(
      "automation_enabled, recovery_emails_enabled, war_room_enabled, customer_ai_replies_enabled, auto_discount_replies_enabled, max_daily_ai_interactions, max_daily_recovery_emails, max_daily_auto_executions"
    )
    .eq("store_id", storeId)
    .single();

  if (!data) return SAFE_DEFAULTS;

  return {
    automation_enabled:            data.automation_enabled            ?? SAFE_DEFAULTS.automation_enabled,
    recovery_emails_enabled:       data.recovery_emails_enabled       ?? SAFE_DEFAULTS.recovery_emails_enabled,
    war_room_enabled:              data.war_room_enabled              ?? SAFE_DEFAULTS.war_room_enabled,
    customer_ai_replies_enabled:   data.customer_ai_replies_enabled   ?? SAFE_DEFAULTS.customer_ai_replies_enabled,
    auto_discount_replies_enabled: data.auto_discount_replies_enabled ?? SAFE_DEFAULTS.auto_discount_replies_enabled,
    max_daily_ai_interactions:     data.max_daily_ai_interactions     ?? SAFE_DEFAULTS.max_daily_ai_interactions,
    max_daily_recovery_emails:     data.max_daily_recovery_emails     ?? SAFE_DEFAULTS.max_daily_recovery_emails,
    max_daily_auto_executions:     data.max_daily_auto_executions     ?? SAFE_DEFAULTS.max_daily_auto_executions,
  };
}

// -------------------------------------------------------
// PRE-EXECUTION SAFETY GATES
// Each gate checks: global kill switch → store setting → global rate → daily limit
// -------------------------------------------------------

export async function assertCanSendEmail(storeId: string): Promise<void> {
  const global = getGlobalFlags();
  if (global.PAUSE_ALL_RECOVERY_EMAILS) {
    throw new Error("[KILL_SWITCH] Global email pause is active. No emails will be sent.");
  }
  const store = await getStoreSafetySettings(storeId);
  if (!store.automation_enabled) {
    throw new Error("[STORE_DISABLED] This store's automation is paused.");
  }
  if (!store.recovery_emails_enabled) {
    throw new Error("[STORE_GATE] Recovery emails are disabled for this store.");
  }
  // Phase 10: global rate limit
  assertGlobalEmailRate();
  // Phase 10: daily store limit
  await assertStoreDailyEmailLimit(storeId, store.max_daily_recovery_emails);
}

export async function assertCanAutoExecute(storeId: string): Promise<void> {
  const global = getGlobalFlags();
  if (global.PAUSE_ALL_AUTO_EXECUTION) {
    throw new Error("[KILL_SWITCH] Global auto-execution pause is active.");
  }
  const store = await getStoreSafetySettings(storeId);
  if (!store.automation_enabled) {
    throw new Error("[STORE_DISABLED] This store's automation is paused.");
  }
  // Phase 10: global rate limit
  assertGlobalAutoExecutionRate();
  // Phase 10: daily store limit
  await assertStoreDailyExecutionLimit(storeId, store.max_daily_auto_executions);
}

export async function assertCanRunWarRoom(storeId: string): Promise<void> {
  const global = getGlobalFlags();
  if (global.DISABLE_WAR_ROOM) {
    throw new Error("[KILL_SWITCH] Global War Room disable switch is active.");
  }
  const store = await getStoreSafetySettings(storeId);
  if (!store.war_room_enabled) {
    throw new Error("[STORE_GATE] War Room is disabled for this store.");
  }
  // Phase 10: global rate limit
  assertGlobalWarRoomRate();
}

export async function assertCanMakeAiCall(storeId: string): Promise<void> {
  const global = getGlobalFlags();
  if (global.PAUSE_ALL_AUTO_EXECUTION) {
    throw new Error("[KILL_SWITCH] Global auto-execution pause is active — AI calls blocked.");
  }
  const store = await getStoreSafetySettings(storeId);
  if (!store.automation_enabled) {
    throw new Error("[STORE_DISABLED] This store's automation is paused.");
  }
  // Phase 10: global rate limit
  assertGlobalAiCallRate();
  // Phase 10: daily store limit
  await assertStoreDailyAiLimit(storeId, store.max_daily_ai_interactions);
}

export async function assertCanSendCustomerAiReply(storeId: string): Promise<void> {
  const global = getGlobalFlags();
  if (global.DISABLE_CUSTOMER_AI_REPLIES || global.FORCE_TEMPLATE_MODE) {
    throw new Error("[KILL_SWITCH] Customer-facing AI replies are globally disabled.");
  }
  const store = await getStoreSafetySettings(storeId);
  if (!store.customer_ai_replies_enabled) {
    throw new Error("[STORE_GATE] Customer AI replies are disabled for this store.");
  }
  // Phase 10: global AI rate limit
  assertGlobalAiCallRate();
  await assertStoreDailyAiLimit(storeId, store.max_daily_ai_interactions);
}

export async function assertCanSendDiscountReply(storeId: string): Promise<void> {
  await assertCanSendCustomerAiReply(storeId);
  const store = await getStoreSafetySettings(storeId);
  if (!store.auto_discount_replies_enabled) {
    throw new Error("[STORE_GATE] Auto discount replies are disabled. Requires merchant approval.");
  }
}

/**
 * ⏱️ RATE LIMITER SERVICE — Phase 10
 *
 * Lightweight in-memory rate limiter for global throughput protection.
 * Uses a simple sliding-window counter pattern — no Redis required.
 *
 * Also provides per-store daily limit checks against Supabase counters.
 */

import { supabase } from "~/utils/supabase.server";
import { ErrorLogger } from "~/services/error-logger.server";

// -------------------------------------------------------
// GLOBAL THROUGHPUT LIMITS (env-configurable)
// Prevents API/email cost explosion from a 100-store spike.
// -------------------------------------------------------
interface GlobalLimits {
  maxAiCallsPerMinute:         number;
  maxEmailsPerMinute:          number;
  maxAutoExecutionsPerMinute:   number;
  maxWarRoomRunsPerHour:       number;
}

function getGlobalLimits(): GlobalLimits {
  return {
    maxAiCallsPerMinute:       parseInt(process.env.GLOBAL_MAX_AI_CALLS_PER_MINUTE       || "60",  10),
    maxEmailsPerMinute:        parseInt(process.env.GLOBAL_MAX_EMAILS_PER_MINUTE          || "30",  10),
    maxAutoExecutionsPerMinute: parseInt(process.env.GLOBAL_MAX_AUTO_EXECUTIONS_PER_MINUTE || "20",  10),
    maxWarRoomRunsPerHour:     parseInt(process.env.GLOBAL_MAX_WAR_ROOM_RUNS_PER_HOUR     || "10",  10),
  };
}

export function getGlobalLimitsStatus(): GlobalLimits & { current: Record<string, number> } {
  const limits = getGlobalLimits();
  return {
    ...limits,
    current: {
      aiCallsThisMinute:       counters.ai_call.getCount(),
      emailsThisMinute:        counters.email.getCount(),
      autoExecutionsThisMinute: counters.auto_execution.getCount(),
      warRoomRunsThisHour:     counters.war_room.getCount(),
    },
  };
}

// -------------------------------------------------------
// SLIDING WINDOW COUNTER (in-memory, no external deps)
// -------------------------------------------------------
class SlidingWindowCounter {
  private timestamps: number[] = [];
  private windowMs: number;

  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  record(): void {
    this.timestamps.push(Date.now());
    this.cleanup();
  }

  getCount(): number {
    this.cleanup();
    return this.timestamps.length;
  }

  isAtLimit(max: number): boolean {
    this.cleanup();
    return this.timestamps.length >= max;
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.windowMs;
    // Remove expired entries (oldest first)
    while (this.timestamps.length > 0 && this.timestamps[0] < cutoff) {
      this.timestamps.shift();
    }
  }
}

const ONE_MINUTE = 60_000;
const ONE_HOUR   = 3_600_000;

const counters = {
  ai_call:        new SlidingWindowCounter(ONE_MINUTE),
  email:          new SlidingWindowCounter(ONE_MINUTE),
  auto_execution: new SlidingWindowCounter(ONE_MINUTE),
  war_room:       new SlidingWindowCounter(ONE_HOUR),
};

// -------------------------------------------------------
// GLOBAL THROUGHPUT GATES
// Call these before each operation. They throw if rate exceeded.
// -------------------------------------------------------

export function assertGlobalAiCallRate(): void {
  const limits = getGlobalLimits();
  if (counters.ai_call.isAtLimit(limits.maxAiCallsPerMinute)) {
    throw new Error(`[RATE_LIMIT] Global AI call limit reached (${limits.maxAiCallsPerMinute}/min). Try again shortly.`);
  }
  counters.ai_call.record();
}

export function assertGlobalEmailRate(): void {
  const limits = getGlobalLimits();
  if (counters.email.isAtLimit(limits.maxEmailsPerMinute)) {
    throw new Error(`[RATE_LIMIT] Global email limit reached (${limits.maxEmailsPerMinute}/min). Try again shortly.`);
  }
  counters.email.record();
}

export function assertGlobalAutoExecutionRate(): void {
  const limits = getGlobalLimits();
  if (counters.auto_execution.isAtLimit(limits.maxAutoExecutionsPerMinute)) {
    throw new Error(`[RATE_LIMIT] Global auto-execution limit reached (${limits.maxAutoExecutionsPerMinute}/min). Try again shortly.`);
  }
  counters.auto_execution.record();
}

export function assertGlobalWarRoomRate(): void {
  const limits = getGlobalLimits();
  if (counters.war_room.isAtLimit(limits.maxWarRoomRunsPerHour)) {
    throw new Error(`[RATE_LIMIT] Global War Room limit reached (${limits.maxWarRoomRunsPerHour}/hr). Try again later.`);
  }
  counters.war_room.record();
}

// -------------------------------------------------------
// PER-STORE DAILY LIMIT CHECKS
// Uses Supabase monthly_usage_counters for persistent tracking.
// -------------------------------------------------------

export interface StoreDailyUsage {
  aiInteractionsToday:    number;
  recoveryEmailsToday:    number;
  autoExecutionsToday:    number;
}

export async function getStoreDailyUsage(storeId: string): Promise<StoreDailyUsage> {
  const billingMonth = new Date().toISOString().slice(0, 7);
  const { data } = await supabase.from("monthly_usage_counters")
    .select("ai_interactions_used, recovery_emails_sent")
    .eq("store_id", storeId)
    .eq("billing_month", billingMonth)
    .single();

  // Count today's auto-executions from agent_actions
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count } = await supabase.from("agent_actions")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .eq("status", "executed")
    .gte("created_at", todayStart.toISOString());

  return {
    aiInteractionsToday:  data?.ai_interactions_used || 0,
    recoveryEmailsToday:  data?.recovery_emails_sent || 0,
    autoExecutionsToday:  count || 0,
  };
}

export async function assertStoreDailyAiLimit(storeId: string, maxDaily: number): Promise<void> {
  const usage = await getStoreDailyUsage(storeId);
  if (usage.aiInteractionsToday >= maxDaily) {
    const msg = `[STORE_LIMIT] Daily AI interaction limit reached (${usage.aiInteractionsToday}/${maxDaily}).`;
    await ErrorLogger.aiCall(storeId, "daily_limit_check", msg);
    throw new Error(msg);
  }
}

export async function assertStoreDailyEmailLimit(storeId: string, maxDaily: number): Promise<void> {
  const usage = await getStoreDailyUsage(storeId);
  if (usage.recoveryEmailsToday >= maxDaily) {
    const msg = `[STORE_LIMIT] Daily recovery email limit reached (${usage.recoveryEmailsToday}/${maxDaily}).`;
    await ErrorLogger.email(storeId, "daily_limit_check", msg);
    throw new Error(msg);
  }
}

export async function assertStoreDailyExecutionLimit(storeId: string, maxDaily: number): Promise<void> {
  const usage = await getStoreDailyUsage(storeId);
  if (usage.autoExecutionsToday >= maxDaily) {
    const msg = `[STORE_LIMIT] Daily auto-execution limit reached (${usage.autoExecutionsToday}/${maxDaily}).`;
    await ErrorLogger.actionExecution(storeId, "daily_limit_check", msg);
    throw new Error(msg);
  }
}

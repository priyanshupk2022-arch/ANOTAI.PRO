/**
 * 🚨 ERROR LOGGING SERVICE
 *
 * Central error tracking for all failed operations.
 * Safe to call anywhere — never throws, never crashes the caller.
 */

import { supabase } from "~/utils/supabase.server";

type Severity = "warning" | "error" | "critical";

interface ErrorLogInput {
  storeId?: string | null;
  source: "ai_call" | "email" | "webhook" | "action_execution" | "margin_guardian" | "supabase_write" | "shopify_api";
  eventType: string;
  severity?: Severity;
  errorMessage: string;
  metadata?: Record<string, any>;
}

/**
 * Log an error to the error_logs table.
 * This function never throws — it catches its own failures silently.
 */
export async function logError({
  storeId,
  source,
  eventType,
  severity = "error",
  errorMessage,
  metadata = {},
}: ErrorLogInput): Promise<void> {
  try {
    await supabase.from("error_logs").insert({
      store_id:      storeId || null,
      source,
      event_type:    eventType,
      severity,
      error_message: errorMessage,
      metadata,
      created_at:    new Date().toISOString(),
    });
  } catch (innerError) {
    // Last-resort: if Supabase write itself fails, log to console only
    console.error("[ERROR_LOG_WRITE_FAILED]", innerError);
    console.error("[ORIGINAL_ERROR]", { source, eventType, errorMessage });
  }
}

/**
 * Convenience wrappers for common sources.
 */
export const ErrorLogger = {
  aiCall: (storeId: string | null, eventType: string, error: Error | string) =>
    logError({ storeId, source: "ai_call", eventType, errorMessage: typeof error === "string" ? error : error.message }),

  email: (storeId: string | null, eventType: string, error: Error | string, metadata?: any) =>
    logError({ storeId, source: "email", eventType, errorMessage: typeof error === "string" ? error : error.message, metadata }),

  webhook: (storeId: string | null, eventType: string, error: Error | string, metadata?: any) =>
    logError({ storeId, source: "webhook", eventType, errorMessage: typeof error === "string" ? error : error.message, metadata }),

  actionExecution: (storeId: string | null, eventType: string, error: Error | string) =>
    logError({ storeId, source: "action_execution", eventType, errorMessage: typeof error === "string" ? error : error.message }),

  marginGuardian: (storeId: string | null, eventType: string, error: Error | string) =>
    logError({ storeId, source: "margin_guardian", eventType, errorMessage: typeof error === "string" ? error : error.message, severity: "warning" }),

  shopifyApi: (storeId: string | null, eventType: string, error: Error | string) =>
    logError({ storeId, source: "shopify_api", eventType, errorMessage: typeof error === "string" ? error : error.message }),

  critical: (storeId: string | null, source: ErrorLogInput["source"], eventType: string, error: Error | string) =>
    logError({ storeId, source, eventType, severity: "critical", errorMessage: typeof error === "string" ? error : error.message }),
};

/**
 * Fetch recent errors for the debug page.
 */
export async function getRecentErrors(storeId?: string, limit = 50) {
  let query = supabase
    .from("error_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (storeId) query = query.eq("store_id", storeId);

  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

/**
 * Mark an error as resolved.
 */
export async function resolveError(errorId: string): Promise<void> {
  await supabase
    .from("error_logs")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", errorId);
}

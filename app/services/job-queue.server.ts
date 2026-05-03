import { executeRecovery, handleCartWebhook, markCartRecovered } from "~/agents/cart-sniper";
import { captureSearchIntent, executeVIPDrop } from "~/agents/retention-engine";
import { supabase } from "~/utils/supabase.server";

const STALE_PROCESSING_JOB_MINUTES = 15;

export type AgentJobType =
  | "cart_update"
  | "cart_recovery"
  | "order_create"
  | "product_create"
  | "product_update"
  | "intent_capture";

export type AgentJob = {
  id: string;
  store_id: string;
  job_type: AgentJobType;
  payload: Record<string, any>;
  idempotency_key?: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  attempts: number;
  max_attempts: number;
  scheduled_at: string;
};

export async function enqueueAgentJob(
  storeId: string,
  jobType: AgentJobType,
  payload: Record<string, any>,
  scheduledAt = new Date(),
  idempotencyKey?: string
) {
  const job = {
    store_id: storeId,
    job_type: jobType,
    payload,
    idempotency_key: idempotencyKey || null,
    status: "pending",
    scheduled_at: scheduledAt.toISOString(),
  };

  const { error } = await supabase.from("agent_jobs").insert(job);

  if (error) {
    if (idempotencyKey && error.code === "23505") {
      return;
    }

    throw new Error(`Failed to enqueue ${jobType}: ${error.message}`);
  }
}

export async function processDueAgentJobs(limit = 10) {
  await releaseStaleProcessingJobs();
  const jobs = await claimDueJobs(limit);
  const results = {
    processed: 0,
    completed: 0,
    failed: 0,
  };

  for (const job of jobs) {
    results.processed++;
    try {
      await processAgentJob(job);
      await markJobCompleted(job.id);
      results.completed++;
    } catch (error) {
      await markJobFailed(job, error);
      results.failed++;
    }
  }

  return results;
}

export async function getJobQueueHealth(storeId: string) {
  const [pending, processing, failed, completedToday] = await Promise.all([
    countJobs(storeId, "pending"),
    countJobs(storeId, "processing"),
    countJobs(storeId, "failed"),
    countJobs(storeId, "completed", new Date(Date.now() - 86400000).toISOString()),
  ]);

  return {
    pending,
    processing,
    failed,
    completedToday,
    status: failed > 0 ? "Attention" : pending > 25 ? "Busy" : "Healthy",
  };
}

async function countJobs(
  storeId: string,
  status: AgentJob["status"],
  since?: string
): Promise<number> {
  let query = supabase
    .from("agent_jobs")
    .select("*", { count: "exact", head: true })
    .eq("store_id", storeId)
    .eq("status", status);

  if (since) {
    query = query.gte("updated_at", since);
  }

  const { count } = await query;
  return count || 0;
}

async function claimDueJobs(limit: number): Promise<AgentJob[]> {
  const { data: pendingJobs, error } = await supabase
    .from("agent_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(limit);

  if (error || !pendingJobs?.length) {
    return [];
  }

  const claimed: AgentJob[] = [];

  for (const job of pendingJobs as AgentJob[]) {
    const { data, error: updateError } = await supabase
      .from("agent_jobs")
      .update({
        status: "processing",
        locked_at: new Date().toISOString(),
        attempts: job.attempts + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("*")
      .single();

    if (!updateError && data) {
      claimed.push(data as AgentJob);
    }
  }

  return claimed;
}

async function releaseStaleProcessingJobs() {
  const staleBefore = new Date(
    Date.now() - STALE_PROCESSING_JOB_MINUTES * 60 * 1000
  ).toISOString();

  const { error } = await supabase
    .from("agent_jobs")
    .update({
      status: "pending",
      locked_at: null,
      scheduled_at: new Date().toISOString(),
      last_error: "Released stale processing lock for retry.",
      updated_at: new Date().toISOString(),
    })
    .eq("status", "processing")
    .lt("locked_at", staleBefore);

  if (error) {
    throw new Error(`Failed to release stale jobs: ${error.message}`);
  }
}

async function processAgentJob(job: AgentJob) {
  switch (job.job_type) {
    case "cart_update":
      await handleCartWebhook(
        job.store_id,
        String(job.payload.cart_token || ""),
        job.payload.customer_email || null,
        job.payload.cart_items || []
      );
      break;

    case "cart_recovery":
      await processCartRecoveryJob(job.store_id, job.payload);
      break;

    case "order_create":
      if (job.payload.cart_token) {
        await markCartRecovered(
          job.store_id,
          String(job.payload.cart_token),
          String(job.payload.order_id || ""),
          Number(job.payload.order_total || 0)
        );
      }
      break;

    case "product_create":
      await executeVIPDrop(
        job.store_id,
        String(job.payload.product_id || ""),
        String(job.payload.title || ""),
        String(job.payload.description || ""),
        Array.isArray(job.payload.tags) ? job.payload.tags : [],
        Number(job.payload.price || 0),
        String(job.payload.product_url || ""),
        job.payload.product_image || ""
      );
      break;

    case "product_update":
      break;

    case "intent_capture":
      await captureSearchIntent(
        job.store_id,
        String(job.payload.email || ""),
        String(job.payload.query || "")
      );
      break;
  }
}

async function processCartRecoveryJob(storeId: string, payload: Record<string, any>) {
  const cartEventId = String(payload.cart_event_id || "");
  const recoveryLevel = Number(payload.recovery_level || 1);

  if (!cartEventId || !Number.isFinite(recoveryLevel)) {
    throw new Error("Cart recovery job is missing cart_event_id or recovery_level.");
  }

  await executeRecovery(storeId, cartEventId, recoveryLevel);
}

async function markJobCompleted(jobId: string) {
  await supabase
    .from("agent_jobs")
    .update({
      status: "completed",
      locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

async function markJobFailed(job: AgentJob, error: unknown) {
  const attempts = job.attempts;
  const shouldRetry = attempts < job.max_attempts;
  const retryDelayMs = Math.min(15 * 60 * 1000, attempts * attempts * 60 * 1000);
  const lastError = error instanceof Error ? error.message : "Unknown job error";

  await supabase
    .from("agent_jobs")
    .update({
      status: shouldRetry ? "pending" : "failed",
      locked_at: null,
      attempts,
      scheduled_at: shouldRetry
        ? new Date(Date.now() + retryDelayMs).toISOString()
        : job.scheduled_at,
      last_error: lastError,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
}

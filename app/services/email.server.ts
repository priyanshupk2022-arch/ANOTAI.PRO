/**
 * 📧 EMAIL SERVICE — Transactional Emails via Resend (Phase 8 Hardened)
 *
 * Changes vs pre-Phase 8:
 * - Kill switch checks before every send
 * - Usage limit enforcement
 * - Error logger integration
 * - Guard against missing customer email
 */

import { ErrorLogger } from "~/services/errorLogger.server";
import { assertCanSendEmail } from "~/services/killSwitch.server";
import { checkPlanLimits, trackRecoveryEmail } from "~/services/usageTracker.server";

export interface EmailPayload {
  to: string;
  from?: string;
  subject: string;
  html: string;
  reply_to?: string;
  tags?: { name: string; value: string }[];
}

export interface EmailResult {
  id: string;
  status: "sent" | "failed" | "blocked";
  error?: string;
}

/**
 * Send a transactional email with full kill switch and limit checks.
 */
export async function sendEmail(
  payload: EmailPayload,
  storeId?: string,
  options?: { skipKillSwitch?: boolean }
): Promise<EmailResult> {
  const fromAddress = payload.from || "ANOTAI <agents@anotai.app>";

  // ── Guard: missing recipient ────────────────────────────────────────
  if (!payload.to || !payload.to.includes("@")) {
    const msg = "Email blocked: missing or invalid recipient address.";
    if (storeId) await ErrorLogger.email(storeId, "send_email", msg);
    return { id: "", status: "blocked", error: msg };
  }

  // ── Kill switch check ───────────────────────────────────────────────
  if (storeId && !options?.skipKillSwitch) {
    try {
      await assertCanSendEmail(storeId);
    } catch (err: any) {
      await ErrorLogger.email(storeId, "send_email", err.message, { to: payload.to });
      return { id: "", status: "blocked", error: err.message };
    }
  }

  // ── Usage limit check ───────────────────────────────────────────────
  if (storeId) {
    const limits = await checkPlanLimits(storeId);
    if (!limits.canSendEmail) {
      const msg = "Email blocked: monthly recovery email limit reached.";
      await ErrorLogger.email(storeId, "send_email", msg, { to: payload.to });
      return { id: "", status: "blocked", error: msg };
    }
  }

  // ── Real Resend API call ────────────────────────────────────────────
  if (process.env.RESEND_API_KEY) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [payload.to],
          subject: payload.subject,
          html: payload.html,
          reply_to: payload.reply_to,
          tags: payload.tags,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        if (storeId) await trackRecoveryEmail(storeId);
        return { id: data.id, status: "sent" };
      } else {
        const errMsg = data.message || "Unknown Resend error";
        if (storeId) await ErrorLogger.email(storeId, "send_email", errMsg, { to: payload.to, resend_response: data });
        return { id: "", status: "failed", error: errMsg };
      }
    } catch (error: any) {
      if (storeId) await ErrorLogger.email(storeId, "send_email", error.message, { to: payload.to });
      return { id: "", status: "failed", error: error.message };
    }
  }

  // ── Development fallback ────────────────────────────────────────────
  console.log("═══════════════════════════════════════");
  console.log("📧 EMAIL SENT (Dev Mode)");
  console.log(`   To: ${payload.to}`);
  console.log(`   From: ${fromAddress}`);
  console.log(`   Subject: ${payload.subject}`);
  console.log("═══════════════════════════════════════");

  if (storeId) await trackRecoveryEmail(storeId);
  return { id: `dev_${Date.now()}`, status: "sent" };
}

/**
 * Send a batch of emails.
 */
export async function sendBatchEmails(payloads: EmailPayload[], storeId?: string): Promise<EmailResult[]> {
  const results: EmailResult[] = [];
  for (const payload of payloads) {
    await new Promise((r) => setTimeout(r, 100));
    const result = await sendEmail(payload, storeId);
    results.push(result);
  }
  return results;
}

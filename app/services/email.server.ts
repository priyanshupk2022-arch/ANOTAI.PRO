/**
 * 📧 EMAIL SERVICE — Transactional Emails via Resend
 * 
 * Used by Cart Sniper for recovery emails and
 * Affiliate Hunter for CPA offer outreach.
 */

// For now we use a mock/console logger. 
// Replace with actual Resend SDK when RESEND_API_KEY is provided.

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
  status: "sent" | "failed";
  error?: string;
}

/**
 * Send a transactional email.
 * In production, this calls the Resend API.
 * Currently logs to console for development.
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const fromAddress = payload.from || "ANOTAI <agents@anotai.app>";

  // Check if Resend API key exists
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
        return { id: data.id, status: "sent" };
      } else {
        return { id: "", status: "failed", error: data.message || "Unknown Resend error" };
      }
    } catch (error: any) {
      return { id: "", status: "failed", error: error.message };
    }
  }

  // Development fallback: log to console
  console.log("═══════════════════════════════════════");
  console.log("📧 EMAIL SENT (Dev Mode)");
  console.log(`   To: ${payload.to}`);
  console.log(`   From: ${fromAddress}`);
  console.log(`   Subject: ${payload.subject}`);
  console.log("═══════════════════════════════════════");

  return { id: `dev_${Date.now()}`, status: "sent" };
}

/**
 * Send a batch of emails (for Affiliate Hunter outreach).
 */
export async function sendBatchEmails(payloads: EmailPayload[]): Promise<EmailResult[]> {
  const results: EmailResult[] = [];
  for (const payload of payloads) {
    // Add small delay between sends to avoid rate limits
    await new Promise((r) => setTimeout(r, 100));
    const result = await sendEmail(payload);
    results.push(result);
  }
  return results;
}

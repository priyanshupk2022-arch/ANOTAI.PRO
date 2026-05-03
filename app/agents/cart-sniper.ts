/**
 * 🎯 CART SNIPER — Revenue Recovery Specialist
 * 
 * Detects abandoned carts, waits 10 minutes, then fires
 * a personalized time-bomb discount link to recover the sale.
 * Every discount is validated by Margin Guardian first.
 */

import { supabase } from "~/utils/supabase.server";
import { validateDiscount } from "./margin-guardian";
import { decideAgentAction, getOwnerControls } from "~/services/agent-controls.server";
import { recordCustomerActivity, upsertCustomerProfile } from "~/services/customer-data.server";
import { sendEmail } from "~/services/email.server";
import { createShopifyRecoveryDiscount } from "~/services/shopify-discounts.server";
import { assertCanSendEmail } from "~/services/kill-switch.server";
import { askAgent } from "~/utils/gemini.server";

// ─── Types ───────────────────────────────────────────────
export interface CartEvent {
  id: string;
  store_id: string;
  cart_token: string;
  customer_email: string | null;
  cart_data: CartItem[];
  status: "abandoned" | "sniped" | "recovered" | "expired";
  abandoned_at: string;
  recovery_sent: boolean;
  recovery_level: number;
  discount_code: string | null;
  discount_expires: string | null;
  recovered_at: string | null;
}

export interface CartItem {
  product_id: string;
  variant_id: string;
  title: string;
  price: number;
  quantity: number;
  image_url?: string;
}

export interface RecoveryResult {
  success: boolean;
  cart_event_id: string;
  discount_code?: string;
  discount_pct?: number;
  email_sent?: boolean;
  reason?: string;
}

type EmailEvent = {
  id: string;
  status: "pending" | "sent" | "failed" | "skipped";
};

// Recovery escalation ladder
const RECOVERY_LADDER = [
  { level: 1, delay_minutes: 10, discount_pct: 10, expiry_minutes: 60 },
  { level: 2, delay_minutes: 1440, discount_pct: 12, expiry_minutes: 120 },
  { level: 3, delay_minutes: 2880, discount_pct: 15, expiry_minutes: 180 },
];

// ─── Core Functions ──────────────────────────────────────

/**
 * Process a cart update webhook — store cart and schedule recovery.
 */
export async function handleCartWebhook(
  storeId: string,
  cartToken: string,
  customerEmail: string | null,
  cartItems: CartItem[]
): Promise<void> {
  if (!cartToken || cartItems.length === 0) {
    return;
  }

  const customerId = await upsertCustomerProfile({
    storeId,
    email: customerEmail,
    metadata: { source: "cart_webhook" },
  });

  const existing = await getCartEvent(storeId, cartToken);
  let cartEventId = existing?.id;

  if (existing) {
    if (existing.status === "recovered" || existing.recovery_sent) {
      return;
    }

    const { data: updated } = await supabase.from("cart_events").update({
      cart_data: cartItems,
      customer_email: customerEmail || existing.customer_email,
      abandoned_at: new Date().toISOString(),
      status: "abandoned",
      recovery_level: 0,
    }).eq("id", existing.id).select("id").single();
    cartEventId = updated?.id || existing.id;
  } else {
    const { data: inserted } = await supabase.from("cart_events").insert({
      store_id: storeId,
      cart_token: cartToken,
      customer_email: customerEmail,
      cart_data: cartItems,
      status: "abandoned",
      abandoned_at: new Date().toISOString(),
      recovery_sent: false,
      recovery_level: 0,
    }).select("id").single();
    cartEventId = inserted?.id;
  }

  await recordCustomerActivity({
    storeId,
    customerId,
    activityType: "cart_abandoned",
    payload: {
      cart_token: cartToken,
      item_count: cartItems.length,
      cart_total: cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    },
  });

  if (cartEventId && customerEmail) {
    const firstRecovery = RECOVERY_LADDER[0];
    const { enqueueAgentJob } = await import("~/services/job-queue.server");
    await enqueueAgentJob(
      storeId,
      "cart_recovery",
      {
        cart_event_id: cartEventId,
        recovery_level: firstRecovery.level,
      },
      new Date(Date.now() + firstRecovery.delay_minutes * 60000),
      `cart_recovery:${cartEventId}:${firstRecovery.level}`
    );
  }
}

/**
 * Process all pending recoveries (runs every minute via cron).
 */
export async function processScheduledRecoveries(storeId: string): Promise<RecoveryResult[]> {
  const results: RecoveryResult[] = [];
  const now = new Date();

  for (const ladder of RECOVERY_LADDER) {
    const { data: carts } = await supabase
      .from("cart_events")
      .select("*")
      .eq("store_id", storeId)
      .eq("status", "abandoned")
      .eq("recovery_level", ladder.level - 1)
      .not("customer_email", "is", null);

    if (!carts) continue;

    for (const cart of carts) {
      const mins = (now.getTime() - new Date(cart.abandoned_at).getTime()) / 60000;
      if (mins < ladder.delay_minutes) continue;

      const result = await executeRecovery(storeId, cart as CartEvent, ladder);
      results.push(result);
    }
  }
  return results;
}

/**
 * Execute recovery: validate discount → generate code → send email.
 */
export async function executeRecovery(
  storeId: string,
  cartEventOrId: CartEvent | string,
  ladderOrLevel: typeof RECOVERY_LADDER[0] | number
): Promise<RecoveryResult> {
  const cartEvent = typeof cartEventOrId === "string"
    ? await getCartEventById(storeId, cartEventOrId)
    : cartEventOrId;
  const ladder = typeof ladderOrLevel === "number"
    ? RECOVERY_LADDER.find((item) => item.level === ladderOrLevel)
    : ladderOrLevel;

  if (!cartEvent || !ladder) {
    return { success: false, cart_event_id: String(cartEventOrId), reason: "Cart recovery target was not found." };
  }

  // Phase 10: Global & Store safety gate
  try {
    await assertCanSendEmail(storeId);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Safety gate blocked recovery.";
    return { success: false, cart_event_id: cartEvent.id, reason: msg };
  }

  if (cartEvent.status !== "abandoned" || cartEvent.recovery_sent) {
    return { success: false, cart_event_id: cartEvent.id, reason: "Recovery already handled for this cart." };
  }

  if (!cartEvent.customer_email) {
    return { success: false, cart_event_id: cartEvent.id, reason: "Customer email is missing." };
  }

  const variantIds = cartEvent.cart_data.map((i) => i.variant_id);
  const prices: Record<string, number> = {};
  cartEvent.cart_data.forEach((i) => { prices[i.variant_id] = i.price; });

  const guardianResult = await validateDiscount(storeId, variantIds, prices, ladder.discount_pct);
  const finalPct = guardianResult.approved ? ladder.discount_pct : guardianResult.max_safe_discount_pct;
  const cartTotal = cartEvent.cart_data.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (finalPct <= 0) {
    await logCartAction(storeId, "recovery_blocked", {
      cart_event_id: cartEvent.id,
      requested_discount_pct: ladder.discount_pct,
      max_safe_discount_pct: guardianResult.max_safe_discount_pct,
      reason: guardianResult.reason || "NO_SAFE_DISCOUNT",
    }, "blocked");

    return { success: false, cart_event_id: cartEvent.id, reason: guardianResult.reason || "No safe discount possible." };
  }

  const controls = await getOwnerControls(storeId);
  const decision = decideAgentAction(controls, {
    agentName: "cart_sniper",
    discountPct: finalPct,
    estimatedRevenueImpact: cartTotal,
  });

  if (!decision.canExecute) {
    await supabase.from("agent_actions").insert({
      store_id: storeId,
      agent_name: "cart_sniper",
      action_type: "recovery_queued",
      payload: {
        cart_event_id: cartEvent.id,
        discount_pct: finalPct,
        recovery_level: ladder.level,
        owner_mode: decision.mode,
        reason: decision.reason,
      },
      status: decision.status,
      revenue_impact: 0,
    });

    return {
      success: false,
      cart_event_id: cartEvent.id,
      discount_pct: finalPct,
      reason: decision.reason,
    };
  }

  const code = generateDiscountCode();
  const expiresAt = new Date(Date.now() + ladder.expiry_minutes * 60000);

  // AI-Powered Personalized Skincare Recovery Email
  const cartSummary = cartEvent.cart_data.map(i => i.title).join(", ");
  const aiPrompt = `You are a Skincare Expert. A customer left these items in their cart: ${cartSummary}.
Write a short, empathetic recovery email. 
Tone: Professional and helpful.
Content: Remind them why these products are great for their skin. Mention that we've reserved a special discount code for them: ${code} (expires in ${ladder.expiry_minutes} mins).
Avoid: Medical claims or aggressive sales pressure.
Return only the HTML body of the email.`;

  let emailHtml = "";
  try {
    emailHtml = await askAgent(storeId, aiPrompt);
  } catch (error) {
    console.warn("AI email generation failed, using fallback:", error);
    emailHtml = buildRecoveryEmail(cartEvent, code, finalPct, expiresAt);
  }

  const { data: claimedCart, error: claimError } = await supabase.from("cart_events").update({
    status: "sniped",
    recovery_sent: true,
    recovery_level: ladder.level,
    discount_code: code,
    discount_expires: expiresAt.toISOString(),
  })
    .eq("id", cartEvent.id)
    .eq("store_id", storeId)
    .eq("status", "abandoned")
    .eq("recovery_sent", false)
    .select("*")
    .single();

  if (claimError || !claimedCart) {
    return { success: false, cart_event_id: cartEvent.id, reason: "Recovery already claimed by another worker." };
  }

  let discountId = "";
  try {
    const discount = await createShopifyRecoveryDiscount({
      storeId,
      code,
      discountPct: finalPct,
      startsAt: new Date(),
      endsAt: expiresAt,
    });
    discountId = discount.id;
  } catch (error) {
    await releaseRecoveryClaim(storeId, cartEvent.id);
    await logCartAction(storeId, "discount_create_failed", {
      cart_event_id: cartEvent.id,
      requested_discount_pct: ladder.discount_pct,
      discount_pct: finalPct,
      reason: error instanceof Error ? error.message : "DISCOUNT_CREATE_FAILED",
    }, "blocked");

    throw error;
  }

  const emailEvent = await claimEmailEvent(storeId, cartEvent.id, cartEvent.customer_email);
  if (!emailEvent) {
    return { success: false, cart_event_id: cartEvent.id, discount_code: code, discount_pct: finalPct, reason: "Recovery email already sent." };
  }

  const emailResult = await sendEmail({
    to: cartEvent.customer_email,
    subject: `Your ${finalPct}% recovery offer expires soon`,
    html: emailHtml,
    tags: [
      { name: "agent", value: "cart_sniper" },
      { name: "cart_event_id", value: cartEvent.id },
    ],
  });

  if (emailResult.status !== "sent") {
    await markEmailEventFailed(emailEvent.id, emailResult.error || "EMAIL_SEND_FAILED");
    await releaseRecoveryClaim(storeId, cartEvent.id);
    throw new Error(emailResult.error || "EMAIL_SEND_FAILED");
  }

  await markEmailEventSent(emailEvent.id, emailResult.id);

  await supabase.from("agent_actions").insert({
    store_id: storeId,
    agent_name: "cart_sniper",
    action_type: "recovery_sent",
    payload: {
      cart_event_id: cartEvent.id,
      discount_pct: finalPct,
      discount_code: code,
      discount_id: discountId,
      recovery_level: ladder.level,
      email_event_id: emailEvent.id,
      email_provider_id: emailResult.id,
    },
    status: "executed",
    revenue_impact: 0,
  });

  await recordCustomerActivity({
    storeId,
    customerId: null,
    activityType: "email_sent",
    payload: {
      cart_event_id: cartEvent.id,
      discount_code: code,
      discount_pct: finalPct,
      email_event_id: emailEvent.id,
    },
  });

  return { success: true, cart_event_id: cartEvent.id, discount_code: code, discount_pct: finalPct, email_sent: true };
}

/**
 * Mark a cart as recovered when an order comes in.
 */
export async function markCartRecovered(storeId: string, cartToken: string, orderId: string, orderTotal: number): Promise<void> {
  const cart = await getCartEvent(storeId, cartToken);
  if (!cart) return;

  const customerId = await upsertCustomerProfile({
    storeId,
    email: cart.customer_email,
    metadata: { source: "order_webhook" },
  });

  await supabase.from("cart_events").update({ status: "recovered", recovered_at: new Date().toISOString() }).eq("id", cart.id);
  await supabase.from("agent_actions").insert({
    store_id: storeId, agent_name: "cart_sniper", action_type: "cart_recovered",
    payload: { cart_event_id: cart.id, order_id: orderId, discount_code: cart.discount_code },
    status: "executed", revenue_impact: orderTotal,
  });

  await recordCustomerActivity({
    storeId,
    customerId,
    activityType: "cart_recovered",
    payload: {
      cart_event_id: cart.id,
      order_id: orderId,
      order_total: orderTotal,
      discount_code: cart.discount_code,
    },
  });
}

/**
 * Get Cart Sniper performance metrics.
 */
export async function getSniperMetrics(storeId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data: events } = await supabase.from("cart_events").select("status").eq("store_id", storeId).gte("abandoned_at", since);
  const { data: actions } = await supabase.from("agent_actions").select("revenue_impact").eq("store_id", storeId).eq("agent_name", "cart_sniper").eq("action_type", "cart_recovered").gte("created_at", since);

  const total = events?.length || 0;
  const recovered = events?.filter((e) => e.status === "recovered").length || 0;
  const revenue = actions?.reduce((sum, a) => sum + (Number(a.revenue_impact) || 0), 0) || 0;

  return { total_detected: total, total_recovered: recovered, recovery_rate: total > 0 ? Math.round((recovered / total) * 100) : 0, revenue_recovered: revenue };
}

// ─── Helpers ─────────────────────────────────────────────
function generateDiscountCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "ANOTAI-";
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

async function getCartEvent(storeId: string, cartToken: string): Promise<CartEvent | null> {
  const { data } = await supabase.from("cart_events").select("*").eq("store_id", storeId).eq("cart_token", cartToken).single();
  return data as CartEvent | null;
}

async function getCartEventById(storeId: string, cartEventId: string): Promise<CartEvent | null> {
  const { data } = await supabase
    .from("cart_events")
    .select("*")
    .eq("store_id", storeId)
    .eq("id", cartEventId)
    .single();

  return data as CartEvent | null;
}

async function releaseRecoveryClaim(storeId: string, cartEventId: string) {
  await supabase
    .from("cart_events")
    .update({
      status: "abandoned",
      recovery_sent: false,
      discount_code: null,
      discount_expires: null,
    })
    .eq("store_id", storeId)
    .eq("id", cartEventId)
    .eq("status", "sniped");
}

async function claimEmailEvent(
  storeId: string,
  cartEventId: string,
  recipient: string | null
): Promise<EmailEvent | null> {
  if (!recipient) return null;
  const { data: existing } = await supabase
    .from("email_events")
    .select("id, status")
    .eq("store_id", storeId)
    .eq("cart_event_id", cartEventId)
    .eq("email_type", "cart_recovery")
    .maybeSingle();

  if (existing?.status === "sent") {
    return null;
  }

  if (existing?.id) {
    const { data } = await supabase
      .from("email_events")
      .update({
        recipient,
        status: "pending",
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("id, status")
      .single();

    return data as EmailEvent | null;
  }

  const { data, error } = await supabase
    .from("email_events")
    .insert({
      store_id: storeId,
      cart_event_id: cartEventId,
      email_type: "cart_recovery",
      recipient,
      status: "pending",
    })
    .select("id, status")
    .single();

  if (error?.code === "23505") {
    return null;
  }

  if (error) {
    throw new Error(`Failed to claim email event: ${error.message}`);
  }

  return data as EmailEvent | null;
}

async function markEmailEventSent(emailEventId: string, providerId: string) {
  await supabase
    .from("email_events")
    .update({
      provider_id: providerId,
      status: "sent",
      sent_at: new Date().toISOString(),
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", emailEventId);
}

async function markEmailEventFailed(emailEventId: string, message: string) {
  await supabase
    .from("email_events")
    .update({
      status: "failed",
      error_message: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", emailEventId);
}

async function logCartAction(
  storeId: string,
  actionType: string,
  payload: Record<string, unknown>,
  status: "pending" | "approved" | "executed" | "blocked"
) {
  await supabase.from("agent_actions").insert({
    store_id: storeId,
    agent_name: "cart_sniper",
    action_type: actionType,
    payload,
    status,
    revenue_impact: 0,
  });
}

function buildRecoveryEmail(
  cartEvent: CartEvent,
  code: string,
  discountPct: number,
  expiresAt: Date
) {
  const items = cartEvent.cart_data
    .map((item) => `<li>${escapeHtml(item.title)} x ${item.quantity}</li>`)
    .join("");

  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <h1 style="font-size: 22px;">Your cart is waiting</h1>
      <p>Use code <strong>${code}</strong> for ${discountPct}% off before it expires.</p>
      <p>This offer expires at ${expiresAt.toUTCString()}.</p>
      <ul>${items}</ul>
      <p>Complete your order before the code closes.</p>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

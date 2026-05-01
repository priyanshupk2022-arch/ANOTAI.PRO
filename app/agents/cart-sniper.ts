/**
 * 🎯 CART SNIPER — Revenue Recovery Specialist
 * 
 * Detects abandoned carts, waits 10 minutes, then fires
 * a personalized time-bomb discount link to recover the sale.
 * Every discount is validated by Margin Guardian first.
 */

import { supabase } from "~/utils/supabase.server";
import { validateDiscount } from "./margin-guardian";

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
  const existing = await getCartEvent(storeId, cartToken);

  if (existing) {
    await supabase.from("cart_events").update({
      cart_data: cartItems,
      customer_email: customerEmail || existing.customer_email,
      abandoned_at: new Date().toISOString(),
      status: "abandoned",
    }).eq("id", existing.id);
  } else {
    await supabase.from("cart_events").insert({
      store_id: storeId,
      cart_token: cartToken,
      customer_email: customerEmail,
      cart_data: cartItems,
      status: "abandoned",
      abandoned_at: new Date().toISOString(),
      recovery_sent: false,
      recovery_level: 0,
    });
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
  cartEvent: CartEvent,
  ladder: typeof RECOVERY_LADDER[0]
): Promise<RecoveryResult> {
  const variantIds = cartEvent.cart_data.map((i) => i.variant_id);
  const prices: Record<string, number> = {};
  cartEvent.cart_data.forEach((i) => { prices[i.variant_id] = i.price; });

  const guardianResult = await validateDiscount(storeId, variantIds, prices, ladder.discount_pct);
  const finalPct = guardianResult.approved ? ladder.discount_pct : guardianResult.max_safe_discount_pct;

  if (finalPct <= 0) {
    return { success: false, cart_event_id: cartEvent.id, reason: "No safe discount possible." };
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

  const aiResponse = await aiModel.generateContent(aiPrompt);
  const emailHtml = (await aiResponse.response).text();

  await supabase.from("cart_events").update({
    status: "sniped",
    recovery_sent: true,
    recovery_level: ladder.level,
    discount_code: code,
    discount_expires: expiresAt.toISOString(),
  }).eq("id", cartEvent.id);

  // Send the actual email
  const { sendEmail } = await import("~/services/email.server");
  await sendEmail({
    to: cartEvent.customer_email!,
    subject: `Wait! Your ${cartEvent.cart_data[0]?.title || "skincare"} routine is incomplete...`,
    html: emailHtml
  });

  await supabase.from("agent_actions").insert({
    store_id: storeId,
    agent_name: "cart_sniper",
    action_type: "recovery_sent",
    payload: { cart_event_id: cartEvent.id, discount_pct: finalPct, discount_code: code, recovery_level: ladder.level },
    status: "executed",
    revenue_impact: 0,
  });

  return { success: true, cart_event_id: cartEvent.id, discount_code: code, discount_pct: finalPct, email_sent: true };
}

/**
 * Mark a cart as recovered when an order comes in.
 */
export async function markCartRecovered(storeId: string, cartToken: string, orderId: string, orderTotal: number): Promise<void> {
  const cart = await getCartEvent(storeId, cartToken);
  if (!cart) return;

  await supabase.from("cart_events").update({ status: "recovered", recovered_at: new Date().toISOString() }).eq("id", cart.id);
  await supabase.from("agent_actions").insert({
    store_id: storeId, agent_name: "cart_sniper", action_type: "cart_recovered",
    payload: { cart_event_id: cart.id, order_id: orderId, discount_code: cart.discount_code },
    status: "executed", revenue_impact: orderTotal,
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
  const revenue = actions?.reduce((sum, a) => sum + (a.revenue_impact || 0), 0) || 0;

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

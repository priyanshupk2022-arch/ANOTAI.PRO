/**
 * 📡 WEBHOOK ENDPOINTS — Shopify Webhook Handlers (Phase 8 Hardened)
 *
 * Changes vs pre-Phase 8:
 * - Idempotency check: duplicate webhook event IDs are skipped
 * - Error logger integration: all failures are persisted to error_logs
 * - Kill switch: automation_enabled is checked before processing
 * - Silent errors log + still return 200 (Shopify requirement)
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { verifyWebhookHMAC, getWebhookTopic, getWebhookShopDomain } from "~/services/webhook-verify.server";
import { handleCartWebhook, markCartRecovered } from "~/agents/cart-sniper";
import { executeVIPDrop } from "~/agents/retention-engine";
import { supabase } from "~/utils/supabase.server";
import { ErrorLogger } from "~/services/errorLogger.server";
import { getStoreSafetySettings } from "~/services/killSwitch.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const rawBody = await request.text();
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256") || "";
  const shopifyEventId = request.headers.get("x-shopify-webhook-id") || "";
  const topic = getWebhookTopic(request.headers);
  const shopDomain = getWebhookShopDomain(request.headers);

  // ── 1. HMAC Verification ──────────────────────────────────────────────
  if (!verifyWebhookHMAC(rawBody, hmacHeader)) {
    await ErrorLogger.webhook(null, topic, `HMAC verification failed for ${shopDomain}`, { shopDomain, topic });
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Parse payload ──────────────────────────────────────────────────
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    await ErrorLogger.webhook(null, topic, "Invalid JSON body", { shopDomain, topic });
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── 3. Resolve store ──────────────────────────────────────────────────
  const { data: store } = await supabase
    .from("stores")
    .select("id, plan_status")
    .eq("shop_domain", shopDomain)
    .single();

  if (!store) {
    await ErrorLogger.webhook(null, topic, `Webhook for unknown store: ${shopDomain}`, { shopDomain, topic });
    return json({ error: "Store not found" }, { status: 404 });
  }

  // ── 4. Idempotency check — skip already-processed events ─────────────
  if (shopifyEventId) {
    const { error: insertError } = await supabase.from("processed_webhooks").insert({
      shopify_event_id: shopifyEventId,
      store_id: store.id,
      topic,
    });

    if (insertError) {
      // 23505 is Postgres unique_violation error code
      if (insertError.code === "23505") {
        console.log(`[WEBHOOK_SPIKE] Duplicate event ${shopifyEventId} blocked (${topic})`);
        return json({ success: true, skipped: true });
      }
      // Log other DB errors but don't fail yet
      await ErrorLogger.webhook(store.id, topic, `DB Error: ${insertError.message}`, { shopifyEventId });
    }
  }

  // ── 5. Check store automation kill switch ─────────────────────────────
  const safety = await getStoreSafetySettings(store.id);
  if (!safety.automation_enabled && topic !== "app/uninstalled") {
    console.log(`[KILL_SWITCH] Automation paused for ${shopDomain} — webhook ${topic} skipped`);
    return json({ success: true, paused: true });
  }

  // ── 6. Route to agent ─────────────────────────────────────────────────
  try {
    switch (topic) {
      case "carts/update":
        if (store.plan_status !== "active") break;
        await handleCartWebhook(
          store.id,
          payload.token || payload.id,
          payload.email || null,
          (payload.line_items || []).map((item: any) => ({
            product_id: String(item.product_id),
            variant_id: String(item.variant_id),
            title: item.title,
            price: parseFloat(item.price),
            quantity: item.quantity,
            image_url: item.image?.src || null,
          }))
        );
        break;

      case "orders/create":
        if (store.plan_status !== "active") break;
        if (payload.cart_token) {
          await markCartRecovered(store.id, payload.cart_token, String(payload.id), parseFloat(payload.total_price || "0"));
        }
        break;

      case "app/uninstalled":
        await supabase.from("stores").delete().eq("id", store.id);
        console.log(`🗑️ Store ${shopDomain} uninstalled — all data deleted`);
        break;

      case "products/update":
        for (const variant of (payload.variants || [])) {
          const inStock = variant.inventory_management === null || variant.inventory_quantity > 0;
          await supabase.from("products_cogs")
            .update({ product_title: `${payload.title} - ${variant.title}`, is_in_stock: inStock, updated_at: new Date().toISOString() })
            .eq("store_id", store.id)
            .eq("variant_id", String(variant.id));
        }
        break;

      case "products/create":
        if (store.plan_status !== "active") break;
        const productUrl = `https://${shopDomain}/products/${payload.handle}`;
        const productImage = payload.images?.[0]?.src || payload.image?.src || "";
        await executeVIPDrop(store.id, String(payload.id), payload.title || "", payload.body_html || "", payload.tags ? payload.tags.split(", ") : [], parseFloat(payload.variants?.[0]?.price || "0"), productUrl, productImage);
        break;

      default:
        console.log(`[WEBHOOK] Unhandled topic: ${topic}`);
    }
  } catch (error: any) {
    // Log failure but still return 200 so Shopify doesn't retry infinitely
    await ErrorLogger.webhook(store.id, topic, error, { shopDomain, payload_id: payload?.id });
    console.error(`❌ Webhook error (${topic}):`, error);
  }

  return json({ success: true });
};

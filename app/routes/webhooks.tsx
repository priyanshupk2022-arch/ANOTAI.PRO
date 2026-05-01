/**
 * 📡 WEBHOOK ENDPOINTS — Shopify Webhook Handlers
 * 
 * Receives and processes webhooks from Shopify:
 * - carts/update → Cart Sniper
 * - orders/create → Track recovered carts
 * - app/uninstalled → GDPR cleanup
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { verifyWebhookHMAC, getWebhookTopic, getWebhookShopDomain } from "~/services/webhook-verify.server";
import { handleCartWebhook, markCartRecovered } from "~/agents/cart-sniper";
import { executeVIPDrop } from "~/agents/retention-engine";
import { supabase } from "~/utils/supabase.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Step 1: Read raw body for HMAC verification
  const rawBody = await request.text();
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256") || "";
  const topic = getWebhookTopic(request.headers);
  const shopDomain = getWebhookShopDomain(request.headers);

  // Step 2: Verify HMAC signature
  if (!verifyWebhookHMAC(rawBody, hmacHeader)) {
    console.error(`⛔ Webhook HMAC verification failed for ${topic} from ${shopDomain}`);
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  // Step 3: Parse the payload
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Step 4: Get the store from database
  const { data: store } = await supabase
    .from("stores")
    .select("id, plan_status")
    .eq("shop_domain", shopDomain)
    .single();

  if (!store) {
    console.error(`⛔ Webhook received for unknown store: ${shopDomain}`);
    return json({ error: "Store not found" }, { status: 404 });
  }

  // Step 5: Route to the correct agent based on topic
  try {
    switch (topic) {
      case "carts/update":
        // Only process if billing is active
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
        console.log(`🎯 Cart Sniper: Processed cart update from ${shopDomain}`);
        break;

      case "orders/create":
        if (store.plan_status !== "active") break;

        // Check if this order was from a recovered cart
        const cartToken = payload.cart_token;
        if (cartToken) {
          await markCartRecovered(
            store.id,
            cartToken,
            String(payload.id),
            parseFloat(payload.total_price || "0")
          );
          console.log(`🎯 Cart Sniper: Order ${payload.id} tracked from ${shopDomain}`);
        }
        break;

      case "app/uninstalled":
        // GDPR: Delete all store data
        await supabase.from("stores").delete().eq("id", store.id);
        console.log(`🗑️ Store ${shopDomain} uninstalled — all data deleted`);
        break;

      case "products/update":
        // Sync stock status and titles
        for (const variant of (payload.variants || [])) {
          const inStock = variant.inventory_management === null || variant.inventory_quantity > 0;
          await supabase.from("products_cogs")
            .update({ 
              product_title: `${payload.title} - ${variant.title}`,
              is_in_stock: inStock,
              updated_at: new Date().toISOString()
            })
            .eq("store_id", store.id)
            .eq("variant_id", String(variant.id));
        }
        console.log(`📦 Inventory Sync: Updated stock for "${payload.title}" from ${shopDomain}`);
        break;

      case "products/create":
        // RETENTION ENGINE: New product uploaded → trigger VIP Drop
        if (store.plan_status !== "active") break;

        const productUrl = `https://${shopDomain}/products/${payload.handle}`;
        const productImage = payload.images?.[0]?.src || payload.image?.src || "";

        await executeVIPDrop(
          store.id,
          String(payload.id),
          payload.title || "",
          payload.body_html || "",
          payload.tags ? payload.tags.split(", ") : [],
          parseFloat(payload.variants?.[0]?.price || "0"),
          productUrl,
          productImage
        );
        console.log(`🔮 Retention Engine: VIP Drop triggered for "${payload.title}" from ${shopDomain}`);
        break;

      default:
        console.log(`📡 Unhandled webhook topic: ${topic}`);
    }
  } catch (error) {
    console.error(`❌ Webhook processing error (${topic}):`, error);
    // Still return 200 to prevent Shopify from retrying
  }

  // Always respond 200 within 5 seconds (Shopify requirement)
  return json({ success: true });
};

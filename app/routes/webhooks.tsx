import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { enqueueAgentJob } from "~/services/job-queue.server";
import { removeStoreByShopDomain } from "~/utils/store.server";
import {
  getWebhookShopDomain,
  getWebhookTopic,
  verifyWebhookHMAC,
} from "~/services/webhook-verify.server";
import { supabase } from "~/utils/supabase.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const rawBody = await request.text();
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256") || "";
  const topic = getWebhookTopic(request.headers);
  const shopDomain = getWebhookShopDomain(request.headers);

  if (!verifyWebhookHMAC(rawBody, hmacHeader)) {
    console.error(`Webhook HMAC verification failed for ${topic} from ${shopDomain}`);
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!topic || !shopDomain) {
    console.warn("Webhook skipped because Shopify topic or shop header was missing.");
    return json({ success: true, skipped: "missing_headers" });
  }

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, plan_status")
    .eq("shop_domain", shopDomain)
    .maybeSingle();

  if (storeError) {
    console.error(`Webhook store lookup failed for ${shopDomain}:`, storeError);
    return json({ success: true, skipped: "store_lookup_failed" });
  }

  if (!store && topic !== "app/uninstalled") {
    console.warn(`Webhook skipped for unknown store: ${shopDomain}`);
    return json({ success: true, skipped: "unknown_store" });
  }

  try {
    switch (topic) {
      case "app_subscriptions/update":
        if (!store) break;

        await syncBillingStatusFromWebhook(store.id, payload);
        break;

      case "carts/update":
        if (!store || store.plan_status !== "active") break;

        await enqueueAgentJob(store.id, "cart_update", {
          cart_token: payload.token || payload.id,
          customer_email: payload.email || null,
          cart_items: (payload.line_items || []).map((item: any) => ({
            product_id: String(item.product_id),
            variant_id: String(item.variant_id),
            title: item.title,
            price: Number(item.price || 0),
            quantity: item.quantity,
            image_url: item.image?.src || null,
          })),
        }, new Date(), `cart_update:${payload.token || payload.id}`);
        break;

      case "orders/create":
        if (!store || store.plan_status !== "active") break;

        await enqueueAgentJob(store.id, "order_create", {
          cart_token: payload.cart_token,
          order_id: String(payload.id),
          order_total: Number(payload.total_price || 0),
        }, new Date(), `order_create:${payload.id}`);
        break;

      case "app/uninstalled":
        await removeStoreByShopDomain(shopDomain);
        break;

      case "products/update":
        if (!store || store.plan_status !== "active") break;

        await enqueueAgentJob(store.id, "product_update", {
          product_id: String(payload.id),
          title: payload.title || "",
        }, new Date(), `product_update:${payload.id}`);
        break;

      case "products/create":
        if (!store || store.plan_status !== "active") break;

        await enqueueAgentJob(store.id, "product_create", {
          product_id: String(payload.id),
          title: payload.title || "",
          description: payload.body_html || "",
          tags: payload.tags ? payload.tags.split(", ") : [],
          price: Number(payload.variants?.[0]?.price || 0),
          product_url: `https://${shopDomain}/products/${payload.handle}`,
          product_image: payload.images?.[0]?.src || payload.image?.src || "",
        }, new Date(), `product_create:${payload.id}`);
        break;

      default:
        console.log(`Unhandled webhook topic: ${topic}`);
    }
  } catch (error) {
    console.error(`Webhook queue error (${topic}):`, error);
  }

  return json({ success: true });
};

async function syncBillingStatusFromWebhook(storeId: string, payload: any) {
  const subscription = payload.app_subscription || payload;
  const status = String(subscription.status || "").toLowerCase();
  const subscriptionId = subscription.admin_graphql_api_id || subscription.id || null;
  const planStatus = status === "active" ? "active" : "inactive";

  const { error } = await supabase
    .from("stores")
    .update({
      plan_status: planStatus,
      billing_id: subscriptionId ? String(subscriptionId) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", storeId);

  if (error) {
    throw new Error(`Failed to sync billing webhook: ${error.message}`);
  }
}

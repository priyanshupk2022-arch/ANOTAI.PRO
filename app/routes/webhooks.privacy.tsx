import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  recordCustomerDataRequest,
  redactCustomerData,
  redactShopData,
} from "~/services/privacy-compliance.server";
import {
  getWebhookShopDomain,
  getWebhookTopic,
  verifyWebhookHMAC,
} from "~/services/webhook-verify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const rawBody = await request.text();
  const topic = getWebhookTopic(request.headers);
  const headerShopDomain = getWebhookShopDomain(request.headers);
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256") || "";

  if (!verifyWebhookHMAC(rawBody, hmacHeader)) {
    console.error(`Privacy webhook HMAC verification failed for ${topic}`);
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const shopDomain = headerShopDomain || payload.shop_domain || "";

  try {
    switch (topic) {
      case "customers/data_request":
        await recordCustomerDataRequest(shopDomain, payload);
        break;

      case "customers/redact":
        await redactCustomerData(shopDomain, payload);
        break;

      case "shop/redact":
        await redactShopData(shopDomain);
        break;

      default:
        return json({ error: `Unsupported privacy webhook topic: ${topic}` }, { status: 400 });
    }
  } catch (error) {
    console.error(`Privacy webhook failed for ${topic}:`, error);
    return json({ error: "Privacy webhook failed" }, { status: 500 });
  }

  return json({ ok: true });
};

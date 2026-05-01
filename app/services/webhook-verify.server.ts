/**
 * 🔒 WEBHOOK VERIFICATION — HMAC Signature Check
 * 
 * Every incoming Shopify webhook is verified using HMAC-SHA256
 * to prevent spoofed/fake requests.
 */

import crypto from "crypto";

const SHOPIFY_SECRET = process.env.SHOPIFY_API_SECRET || "";

/**
 * Verify that a webhook request is genuinely from Shopify.
 */
export function verifyWebhookHMAC(rawBody: string, hmacHeader: string): boolean {
  if (!SHOPIFY_SECRET || !hmacHeader) return false;

  const generatedHash = crypto
    .createHmac("sha256", SHOPIFY_SECRET)
    .update(rawBody, "utf8")
    .digest("base64");

  const generatedBuffer = Buffer.from(generatedHash);
  const headerBuffer = Buffer.from(hmacHeader);

  if (generatedBuffer.length !== headerBuffer.length) return false;

  return crypto.timingSafeEqual(generatedBuffer, headerBuffer);
}

/**
 * Extract the webhook topic from Shopify headers.
 */
export function getWebhookTopic(headers: Headers): string {
  return headers.get("x-shopify-topic") || "";
}

/**
 * Extract the shop domain from Shopify headers.
 */
export function getWebhookShopDomain(headers: Headers): string {
  return headers.get("x-shopify-shop-domain") || "";
}

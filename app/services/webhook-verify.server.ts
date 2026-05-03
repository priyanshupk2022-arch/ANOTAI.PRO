import crypto from "crypto";

const SHOPIFY_SECRET = process.env.SHOPIFY_API_SECRET || "";

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

export function getWebhookTopic(headers: Headers): string {
  return headers.get("x-shopify-topic") || "";
}

export function getWebhookShopDomain(headers: Headers): string {
  return headers.get("x-shopify-shop-domain") || "";
}

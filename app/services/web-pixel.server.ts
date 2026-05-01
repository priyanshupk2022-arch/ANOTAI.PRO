const WEB_PIXEL_SCRIPT = `
// ANOTAI Intent Tracker - Shopify Web Pixel
// Listens for customer intent events and sends safe signals to ANOTAI.

const ANOTAI_ENDPOINT = "{{APP_URL}}/api/intent/capture?shop={{SHOP_DOMAIN}}";

analytics.subscribe("search_submitted", async (event) => {
  try {
    const searchQuery = event.data?.searchResult?.query || "";
    if (!searchQuery || searchQuery.trim().length < 2) return;

    const customerEmail =
      event.data?.customer?.email ||
      event.data?.checkout?.email ||
      "";

    if (!customerEmail) return;

    await fetch(ANOTAI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: customerEmail,
        query: searchQuery.trim(),
        type: "search",
        timestamp: new Date().toISOString(),
      }),
      keepalive: true,
    });
  } catch (e) {
    // Never break the storefront.
  }
});

analytics.subscribe("product_viewed", async (event) => {
  try {
    const customerEmail = event.data?.customer?.email || "";
    const productTitle =
      event.data?.productVariant?.product?.title ||
      event.data?.productVariant?.title ||
      "";

    if (!customerEmail || !productTitle) return;

    await fetch(ANOTAI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: customerEmail,
        query: productTitle,
        type: "product_view",
        timestamp: new Date().toISOString(),
      }),
      keepalive: true,
    });
  } catch (e) {
    // Never break the storefront.
  }
});
`;

export function getWebPixelScript(appUrl: string, shopDomain: string): string {
  return WEB_PIXEL_SCRIPT
    .replaceAll("{{APP_URL}}", appUrl)
    .replaceAll("{{SHOP_DOMAIN}}", encodeURIComponent(shopDomain));
}

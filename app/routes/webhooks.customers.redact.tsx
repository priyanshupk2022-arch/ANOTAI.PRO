import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  console.log(`GDPR Webhook received: ${topic} for ${shop}`);

  // According to Shopify requirements, this endpoint should acknowledge receipt with 200 OK.
  return new Response(null, { status: 200 });
};

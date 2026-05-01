import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  console.log(`GDPR Webhook received: ${topic} for ${shop}`);
  return new Response(null, { status: 200 });
};

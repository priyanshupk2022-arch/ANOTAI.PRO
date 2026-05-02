/**
 * 📡 INTENT CAPTURE API — Receives search data from Web Pixel
 * 
 * POST /api/intent/capture
 * Body: { email, query, type?, timestamp }
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { captureSearchIntent } from "~/agents/retention-engine";
import { supabase } from "~/utils/supabase.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);
    const body = await request.json();
    const { email, query } = body;

    if (!email || !query) {
      return json({ error: "Missing email or query" }, { status: 400, headers: corsHeaders });
    }

    // Determine store from request origin/referer
    const origin = request.headers.get("origin") || request.headers.get("referer") || "";
    const shopDomain = url.searchParams.get("shop") || extractShopDomain(origin);

    if (!shopDomain) {
      return json({ error: "Cannot determine store" }, { status: 400, headers: corsHeaders });
    }

    // Get store ID
    const { data: store } = await supabase
      .from("stores")
      .select("id, plan_status")
      .eq("shop_domain", shopDomain)
      .single();

    if (!store || store.plan_status !== "active") {
      return json({ ok: true }, { headers: corsHeaders }); // Silent fail for inactive stores
    }

    // Capture the intent
    await captureSearchIntent(store.id, email, query);

    return json({ ok: true }, { headers: corsHeaders });
  } catch {
    return json({ ok: true }, { headers: corsHeaders }); // Never return errors to storefront pixel
  }
};

// CORS headers for cross-origin pixel requests
export const loader = async ({ request }: LoaderFunctionArgs) => {
  return json(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};

function extractShopDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    if (hostname.endsWith(".myshopify.com")) return hostname;
    return "";
  } catch {
    return "";
  }
}

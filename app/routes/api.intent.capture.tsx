/**
 * 📡 INTENT CAPTURE API — Receives search data from Web Pixel
 * 
 * POST /api/intent/capture
 * Body: { email, query, type?, timestamp }
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { enqueueAgentJob } from "~/services/job-queue.server";
import { supabase } from "~/utils/supabase.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MAX_QUERY_LENGTH = 160;
const MAX_EMAIL_LENGTH = 254;

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);
    const body = await request.json();
    const email = normalizeEmail(body.email);
    const query = normalizeQuery(body.query);
    const type = typeof body.type === "string" ? body.type.slice(0, 40) : "search";

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

    if (!store || (store.plan_status !== "active" && store.plan_status !== "trialing")) {
      return json({ ok: true }, { headers: corsHeaders }); // Silent fail for inactive stores
    }

    // 🔒 SECURITY: Unauthenticated storefront callers are blocked from queueing jobs
    console.warn(`[SECURITY] Blocked unauthenticated intent capture attempt for shop: ${shopDomain}`);
    
    /* 
    await enqueueAgentJob(store.id, "intent_capture", {
      email,
      query,
      type,
      shop_domain: shopDomain,
    }, new Date(), `intent_capture:${store.id}:${email}:${query.toLowerCase()}`);
    */

    return json({ ok: true }, { headers: corsHeaders });
  } catch {
    return json({ ok: true }, { headers: corsHeaders }); // Never return errors to storefront pixel
  }
};

// CORS headers for cross-origin pixel requests
export const loader = async (_args: LoaderFunctionArgs) => {
  return json(null, { headers: corsHeaders });
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

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  const email = value.trim().toLowerCase();
  if (email.length > MAX_EMAIL_LENGTH) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizeQuery(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH);
}

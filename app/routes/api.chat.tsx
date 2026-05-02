import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { getSkincareAdvice } from "~/agents/personal-shopper";
import { supabase } from "~/utils/supabase.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // 1. Handle CORS (Shopify App Proxy requests don't need full CORS but good to handle)
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });

  try {
    const { shop, customer_email, message } = await request.json();

    if (!shop || !message) return json({ error: "Missing required fields" }, { status: 400, headers: corsHeaders });

    // 2. Resolve storeId from shop domain
    const { data: store } = await supabase.from("stores").select("id").eq("shop_domain", shop).single();
    if (!store) return json({ error: "Store not found" }, { status: 404, headers: corsHeaders });

    // 3. Get catalog (simple stub for now, would fetch from DB in prod)
    const { data: products } = await supabase.from("products_cogs").select("product_id, variant_id, product_title, cogs").eq("store_id", store.id);
    const catalog = products?.map(p => ({ id: p.product_id, variant_id: p.variant_id, title: p.product_title, price: 0 })) || [];

    // 4. Get AI advice
    const response = await getSkincareAdvice(
      store.id,
      customer_email || "anonymous@guest.com",
      message,
      catalog
    );

    return json(response, {
      headers: corsHeaders
    });
  } catch (error) {
    console.error("Chat API Error:", error);
    return json({ error: "Something went wrong" }, { status: 500, headers: corsHeaders });
  }
};

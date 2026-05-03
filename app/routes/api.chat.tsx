import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { getSkincareConsultation } from "~/agents/personal-shopper";
import { supabase } from "~/utils/supabase.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // 1. Handle CORS (Shopify App Proxy requests don't need full CORS but good to handle)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST" }
    });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { shop, customer_email, message } = await request.json();

    if (!shop || !message) return json({ error: "Missing required fields" }, { status: 400 });

    // 2. Resolve storeId from shop domain
    const { data: store } = await supabase.from("stores").select("id").eq("shop_domain", shop).single();
    if (!store) return json({ error: "Store not found" }, { status: 404 });

    // 3. Get catalog (simple stub for now, would fetch from DB in prod)
    const { data: products } = await supabase.from("products_cogs").select("product_id, variant_id, product_title, cogs").eq("store_id", store.id);
    const catalog = products?.map(p => ({ 
      id: p.product_id, 
      variant_id: p.variant_id, 
      title: p.product_title, 
      price: Number(p.cogs) * 1.5,
      in_stock: true 
    })) || [];

    // 4. Get AI advice
    const response = await getSkincareConsultation(
      store.id,
      { 
        concern: message,
        requestedProductTitle: message // Basic heuristic
      },
      catalog as any
    );

    return json({
      message: response.summary,
      recommendations: response.routine.map(r => ({
        product_id: r.product_id,
        variant_id: r.variant_id,
        title: r.title,
        price: r.price,
        reasoning: r.reason,
        is_alternative: false
      }))
    }, {
      headers: { "Access-Control-Allow-Origin": "*" }
    });
  } catch (error) {
    console.error("Chat API Error:", error);
    return json({ error: "Something went wrong" }, { status: 500 });
  }
};

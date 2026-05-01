/**
 * 🛍️ AI PERSONAL SHOPPER (Skincare Edition)
 * 
 * A specialized conversational assistant for Beauty/Skincare brands.
 * Focuses on routines, skin concerns, and safety guardrails.
 */

import { supabase } from "~/utils/supabase.server";
import { aiModel } from "~/utils/gemini.server";
import { validateDiscount } from "./margin-guardian";

// ─── Types ───────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ShopperResponse {
  message: string;
  recommendations: {
    product_id: string;
    variant_id: string;
    title: string;
    price: number;
    reasoning: string;
    is_alternative: boolean; // True if suggested because primary was OOS
  }[];
  discount?: {
    code: string;
    pct: number;
    reason: string;
  };
}

// ─── Core Logic ──────────────────────────────────────────

/**
 * Main entry: Process customer chat and return skincare advice.
 */
export async function getSkincareAdvice(
  storeId: string,
  customerEmail: string,
  userMessage: string,
  catalog: any[]
): Promise<ShopperResponse> {
  // 1. Get/Create Session & Playbook
  const { data: store } = await supabase.from("stores").select("settings").eq("id", storeId).single();
  const playbook = store?.settings || {};

  const { data: session } = await supabase.from("shopper_sessions")
    .select("*")
    .eq("store_id", storeId)
    .eq("customer_email", customerEmail)
    .single();

  const history: ChatMessage[] = session?.chat_history || [];
  history.push({ role: "user", content: userMessage });

  // 2. Prepare Prompt with Skincare Guardrails
  const systemPrompt = `You are a specialized Skincare Assistant for a premium beauty brand.
Brand Voice: ${playbook.brand_voice || "Professional, empathetic, and expert"}.
Merchant Niche: ${playbook.niche || "Skincare"}.

CRITICAL SAFETY RULES:
- NEVER make medical diagnoses (e.g., "You have eczema").
- NEVER promise results (e.g., "This will 100% fix your skin").
- NEVER make fairness/whitening claims.
- If a customer mentions severe allergies, pregnancy, or prescription medication, add a disclaimer to consult a doctor.
- Suggest "Cleanser -> Serum -> Moisturizer -> Sunscreen" style routines where appropriate.

CATALOG KNOWLEDGE:
- Only recommend products from this catalog: ${JSON.stringify(catalog.slice(0, 20))}
- If a product is mentioned but is OUT OF STOCK (assume items not in catalog are OOS), suggest the closest in-stock alternative.
- Do not suggest products from competitors.

RESPONSE FORMAT:
Return valid JSON:
{
  "message": "Direct answer to the customer",
  "recommendations": [{"product_id": "...", "variant_id": "...", "title": "...", "price": 0, "reasoning": "...", "is_alternative": false}],
  "discount_intent": {"pct": 10, "reason": "Bundle offer"} (optional)
}`;

  // 3. Call LLM
  const chat = aiModel.startChat({
    history: history.map(m => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] })),
  });

  const result = await chat.sendMessage(systemPrompt + "\n\nUser Message: " + userMessage);
  const responseText = result.response.text();

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    const parsed = JSON.parse(jsonMatch[0]);

    // 4. Validate Discounts with Margin Guardian
    if (parsed.discount_intent) {
      const variantIds = parsed.recommendations.map((r: any) => r.variant_id);
      const prices: any = {};
      parsed.recommendations.forEach((r: any) => prices[r.variant_id] = r.price);
      
      const guardian = await validateDiscount(storeId, variantIds, prices, parsed.discount_intent.pct);
      if (guardian.approved) {
        parsed.discount = { code: "SKINCARE_SAVE", pct: parsed.discount_intent.pct, reason: parsed.discount_intent.reason };
      }
    }

    // 5. Save History
    history.push({ role: "assistant", content: parsed.message });
    await supabase.from("shopper_sessions").upsert({
      store_id: storeId,
      customer_email: customerEmail,
      chat_history: history.slice(-10), // Keep last 10 messages
      updated_at: new Date().toISOString()
    });

    // 6. Log Action
    await supabase.from("agent_actions").insert({
      store_id: storeId,
      agent_name: "personal_shopper",
      action_type: "skincare_consultation",
      payload: { message_count: history.length, recommendations: parsed.recommendations.length },
      status: "executed"
    });

    return parsed;
  } catch (e) {
    console.error("Personal Shopper Parse Error:", e);
    return { message: "I'm having trouble analyzing the catalog right now. How else can I help?", recommendations: [] };
  }
}

/**
 * Get Personal Shopper performance metrics (Compatible with Orchestrator).
 */
export async function getShopperMetrics(storeId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data: actions } = await supabase.from("agent_actions")
    .select("action_type, revenue_impact")
    .eq("store_id", storeId)
    .eq("agent_name", "personal_shopper")
    .gte("created_at", since);

  const consultations = actions?.filter((a) => a.action_type === "skincare_consultation").length || 0;
  const accepted = actions?.filter((a) => (a.revenue_impact || 0) > 0).length || 0;
  const revenue = actions?.reduce((s, a) => s + (Number(a.revenue_impact) || 0), 0) || 0;

  return {
    total_impressions: consultations,
    total_accepted: accepted,
    acceptance_rate: consultations > 0 ? Math.round((accepted / consultations) * 100) : 0,
    revenue_generated: revenue,
  };
}

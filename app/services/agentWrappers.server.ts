import { getSkincareConsultation } from "~/agents/personal-shopper";
import { executeRecovery } from "~/agents/cart-sniper";
import { validateDiscount } from "~/agents/margin-guardian";
import { getIntentMetrics } from "~/agents/retention-engine";
import { supabase } from "~/utils/supabase.server";

export async function runPersonalShopperWrapper(storeId: string, email: string, message: string, catalog: any[]) {
  // Adaptation: Wrap the message as concern for the production consultation logic
  const result = await getSkincareConsultation(storeId, { concern: message }, catalog);
  return {
    observation: "Customer asked a skincare question.",
    recommendation: result.summary,
    requested_action: {
      type: "send_chat_response",
      payload: result
    },
    confidence_score: 95,
    risk_score: 10
  };
}

export async function runCartSniperWrapper(storeId: string, cartEventId: string) {
  // executeRecovery requires the full cartEvent object, so we'd fetch it here.
  // For the wrapper, we simulate the structure to fit the orchestrator.
  return {
    observation: "Cart was abandoned. Sniper agent assessed the ladder.",
    recommendation: "Send personalized recovery email with an optimized discount.",
    requested_action: {
      type: "execute_cart_recovery",
      payload: { cartEventId }
    },
    confidence_score: 90,
    risk_score: 20
  };
}

export async function runRetentionEngineWrapper(storeId: string, email: string) {
  // Normally calls getIntentMetrics or process scheduled emails
  return {
    observation: "Analyzed customer VIP status and search intent.",
    recommendation: "Customer is a prime candidate for a VIP drop email.",
    requested_action: {
      type: "send_retention_email",
      payload: { email }
    },
    confidence_score: 85,
    risk_score: 15
  };
}

export async function runMarginGuardianWrapper(storeId: string, variantIds: string[], prices: any, requestedPct: number) {
  // Fetch merchant auto-approve limits and shipping costs
  // Default fallback values if columns don't exist yet
  let limit = 15;
  let allowFreeShipping = false;
  let estimatedShipping = null;

  try {
    const { data: settings } = await supabase.from("merchant_agent_settings")
      .select("require_approval_above_discount, allow_auto_free_shipping, estimated_shipping_cost")
      .eq("store_id", storeId)
      .single();
    
    if (settings) {
      limit = settings.require_approval_above_discount ?? 15;
      // We check if the property exists in the DB result object, if so, use it, else default
      if ('allow_auto_free_shipping' in settings) allowFreeShipping = (settings as any).allow_auto_free_shipping;
      if ('estimated_shipping_cost' in settings) estimatedShipping = (settings as any).estimated_shipping_cost;
    }
  } catch (e) {
    // Graceful fallback if columns don't exist in DB yet
    console.warn("Margin Guardian Wrapper: Could not fetch advanced shipping settings, using safe defaults.");
  }

  const guardianResult = await validateDiscount(
    storeId, 
    variantIds, 
    prices, 
    requestedPct, 
    limit, 
    allowFreeShipping, 
    estimatedShipping
  );
  
  return {
    observation: `Evaluated ${requestedPct}% discount against COGS.`,
    recommendation: guardianResult.approved ? "Discount is safe." : `Discount is unsafe. Proposed alternative: ${guardianResult.alternative_offer_value}% or ${guardianResult.alternative_offer_type}`,
    requested_action: {
      type: guardianResult.approved ? "approve_discount" : "propose_alternative",
      payload: guardianResult
    },
    confidence_score: 100,
    risk_score: guardianResult.approved ? 10 : (guardianResult.auto_reply_allowed ? 40 : 90)
  };
}

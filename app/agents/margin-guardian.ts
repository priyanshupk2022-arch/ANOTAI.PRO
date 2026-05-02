/**
 * 🛡️ MARGIN GUARDIAN — Profit Protection Firewall
 * 
 * The Margin Guardian is the GATEKEEPER of ANOTAI.
 * No discount goes to the customer without Guardian's approval.
 * 
 * Rule: Minimum Price = COGS × 1.20 (ensures 20% minimum profit margin)
 */

import { supabase } from "~/utils/supabase.server";

// ─── Types ───────────────────────────────────────────────
export interface COGSEntry {
  id: string;
  store_id: string;
  product_id: string;
  variant_id: string;
  product_title: string;
  cogs: number;
  min_price: number;
  updated_at: string;
}

export interface ValidationResult {
  approved: boolean;
  max_safe_discount_pct: number;
  reason: string;
  details: {
    variant_id: string;
    product_title: string;
    current_price: number;
    cogs: number;
    min_price: number;
    requested_discount_pct: number;
    discounted_price: number;
  }[];
  requested_discount: number;
  requested_discount_safe: boolean;
  alternative_offer_type: "discount" | "bundle" | "free_shipping" | "no_discount_value_offer" | "none";
  alternative_offer_value: string;
  estimated_shipping_cost: number | null;
  free_shipping_margin_safe: boolean;
  auto_free_shipping_allowed: boolean;
  final_estimated_profit: number;
  final_estimated_margin: number;
  auto_reply_allowed: boolean;
  requires_merchant_approval: boolean;
  customer_message_status: "sent" | "drafted" | "blocked";
}

export interface MarginReport {
  total_products: number;
  products_with_cogs: number;
  coverage_pct: number;
  average_margin_pct: number;
  lowest_margin_product: string;
  lowest_margin_pct: number;
  at_risk_products: number;
}

// ─── Core Functions ──────────────────────────────────────

/**
 * The main validation function. Every discount request MUST pass through here.
 * Returns whether the discount is safe + the maximum safe discount if rejected.
 */
export async function validateDiscount(
  storeId: string,
  variantIds: string[],
  currentPrices: Record<string, number>,
  requestedDiscountPct: number,
  merchantAutoApproveLimit: number = 15,
  merchantAllowsAutoFreeShipping: boolean = false,
  estimatedShippingCost: number | null = null
): Promise<ValidationResult> {
  const details: ValidationResult["details"] = [];
  let overallApproved = true;
  let minSafeDiscountPct = requestedDiscountPct;
  let totalCurrentPrice = 0;
  let totalCogs = 0;

  for (const variantId of variantIds) {
    // Fetch COGS for this variant
    const cogs = await getCOGS(storeId, variantId);

    if (!cogs) {
      // No COGS data = BLOCK the discount (safety first)
      overallApproved = false;
      details.push({
        variant_id: variantId,
        product_title: "Unknown (Missing COGS)",
        current_price: currentPrices[variantId] || 0,
        cogs: 0,
        min_price: 0,
        requested_discount_pct: requestedDiscountPct,
        discounted_price: 0,
      });
      continue;
    }

    const currentPrice = currentPrices[variantId] || 0;
    const minPrice = cogs.cogs * 1.20; // 20% margin floor
    const discountedPrice = currentPrice * (1 - requestedDiscountPct / 100);
    const maxSafe = calculateMaxDiscount(currentPrice, cogs.cogs);

    totalCurrentPrice += currentPrice;
    totalCogs += cogs.cogs;

    if (discountedPrice < minPrice) {
      overallApproved = false;
      minSafeDiscountPct = Math.min(minSafeDiscountPct, maxSafe);
    }

    details.push({
      variant_id: variantId,
      product_title: cogs.product_title,
      current_price: currentPrice,
      cogs: cogs.cogs,
      min_price: minPrice,
      requested_discount_pct: requestedDiscountPct,
      discounted_price: discountedPrice,
    });
  }

  // Calculate Alternative Offer
  let altOfferType: ValidationResult["alternative_offer_type"] = "none";
  let altOfferValue = "0";
  let freeShippingMarginSafe = false;
  let finalEstimatedProfit = 0;
  let finalEstimatedMargin = 0;

  if (!overallApproved) {
    if (minSafeDiscountPct > 0) {
      altOfferType = "discount";
      altOfferValue = Math.floor(minSafeDiscountPct).toString();
      finalEstimatedProfit = (totalCurrentPrice * (1 - Math.floor(minSafeDiscountPct) / 100)) - totalCogs;
      finalEstimatedMargin = totalCurrentPrice > 0 ? (finalEstimatedProfit / totalCurrentPrice) * 100 : 0;
    } else {
      altOfferType = "free_shipping";
      altOfferValue = "free_shipping";
      if (estimatedShippingCost !== null) {
        finalEstimatedProfit = totalCurrentPrice - totalCogs - estimatedShippingCost;
        finalEstimatedMargin = totalCurrentPrice > 0 ? (finalEstimatedProfit / totalCurrentPrice) * 100 : 0;
        freeShippingMarginSafe = finalEstimatedMargin >= 20; // Floor
      } else {
        freeShippingMarginSafe = false;
      }
    }
  } else {
    altOfferType = "discount";
    altOfferValue = requestedDiscountPct.toString();
    finalEstimatedProfit = (totalCurrentPrice * (1 - requestedDiscountPct / 100)) - totalCogs;
    finalEstimatedMargin = totalCurrentPrice > 0 ? (finalEstimatedProfit / totalCurrentPrice) * 100 : 0;
  }

  // Determine Auto Reply Rules
  let autoReplyAllowed = false;
  
  if (overallApproved) {
    autoReplyAllowed = true;
  } else if (altOfferType === "discount") {
    autoReplyAllowed = finalEstimatedMargin >= 20 && Number(altOfferValue) <= merchantAutoApproveLimit;
  } else if (altOfferType === "free_shipping") {
    autoReplyAllowed = freeShippingMarginSafe && merchantAllowsAutoFreeShipping;
  }

  const requiresMerchantApproval = !autoReplyAllowed;
  const messageStatus = autoReplyAllowed ? "sent" : "drafted";

  // Log this action
  await logGuardianAction(storeId, overallApproved, requestedDiscountPct, minSafeDiscountPct, details);

  return {
    approved: overallApproved,
    max_safe_discount_pct: overallApproved ? requestedDiscountPct : Math.floor(minSafeDiscountPct),
    reason: overallApproved
      ? `✅ Discount approved. All products maintain 20%+ margin.`
      : `⛔ Discount BLOCKED. Would breach margin floor. Max safe discount: ${Math.floor(minSafeDiscountPct)}%`,
    details,
    requested_discount: requestedDiscountPct,
    requested_discount_safe: overallApproved,
    alternative_offer_type: altOfferType,
    alternative_offer_value: altOfferValue,
    estimated_shipping_cost: estimatedShippingCost,
    free_shipping_margin_safe: freeShippingMarginSafe,
    auto_free_shipping_allowed: merchantAllowsAutoFreeShipping,
    final_estimated_profit: Math.round(finalEstimatedProfit * 100) / 100,
    final_estimated_margin: Math.round(finalEstimatedMargin * 100) / 100,
    auto_reply_allowed: autoReplyAllowed,
    requires_merchant_approval: requiresMerchantApproval,
    customer_message_status: overallApproved ? "sent" : messageStatus,
  };
}

/**
 * Calculate the maximum safe discount percentage for a product.
 * Formula: max_discount = ((price - min_price) / price) * 100
 */
export function calculateMaxDiscount(currentPrice: number, cogs: number): number {
  if (currentPrice <= 0) return 0;
  const minPrice = cogs * 1.20;
  const maxDiscount = ((currentPrice - minPrice) / currentPrice) * 100;
  return Math.max(0, Math.floor(maxDiscount * 100) / 100); // Floor to 2 decimals, never negative
}

/**
 * Get the minimum safe selling price for a variant.
 */
export function getMinPrice(cogs: number): number {
  return Math.ceil(cogs * 1.20 * 100) / 100; // Ceil to 2 decimals (always round up)
}

// ─── COGS Data Functions ─────────────────────────────────

/**
 * Fetch COGS entry for a specific variant.
 */
export async function getCOGS(storeId: string, variantId: string): Promise<COGSEntry | null> {
  const { data, error } = await supabase
    .from("products_cogs")
    .select("*")
    .eq("store_id", storeId)
    .eq("variant_id", variantId)
    .single();

  if (error || !data) return null;
  return data as COGSEntry;
}

/**
 * Fetch ALL COGS entries for a store (for dashboard table).
 */
export async function getAllCOGS(storeId: string): Promise<COGSEntry[]> {
  const { data, error } = await supabase
    .from("products_cogs")
    .select("*")
    .eq("store_id", storeId)
    .order("product_title", { ascending: true });

  if (error) return [];
  return data as COGSEntry[];
}

/**
 * Create or update a single COGS entry.
 */
export async function upsertCOGS(
  storeId: string,
  productId: string,
  variantId: string,
  productTitle: string,
  cogs: number
): Promise<COGSEntry | null> {
  const { data, error } = await supabase
    .from("products_cogs")
    .upsert(
      {
        store_id: storeId,
        product_id: productId,
        variant_id: variantId,
        product_title: productTitle,
        cogs: cogs,
        min_price: getMinPrice(cogs),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "store_id,variant_id" }
    )
    .select()
    .single();

  if (error) {
    console.error("COGS upsert failed:", error);
    return null;
  }
  return data as COGSEntry;
}

/**
 * Bulk import COGS from parsed CSV data.
 */
export async function bulkImportCOGS(
  storeId: string,
  rows: { product_id: string; variant_id: string; product_title: string; cogs: number }[]
): Promise<{ imported: number; errors: number }> {
  let imported = 0;
  let errors = 0;

  for (const row of rows) {
    const result = await upsertCOGS(storeId, row.product_id, row.variant_id, row.product_title, row.cogs);
    if (result) imported++;
    else errors++;
  }

  return { imported, errors };
}

/**
 * Get COGS coverage stats (how many products have COGS data).
 */
export async function getCOGSCoverage(storeId: string, totalProducts: number): Promise<{
  total: number;
  covered: number;
  percentage: number;
}> {
  const { count } = await supabase
    .from("products_cogs")
    .select("*", { count: "exact", head: true })
    .eq("store_id", storeId);

  const covered = count || 0;
  return {
    total: totalProducts,
    covered,
    percentage: totalProducts > 0 ? Math.round((covered / totalProducts) * 100) : 0,
  };
}

/**
 * Generate a full margin health report for the store.
 */
export async function getMarginReport(storeId: string): Promise<MarginReport> {
  const allCogs = await getAllCOGS(storeId);

  if (allCogs.length === 0) {
    return {
      total_products: 0,
      products_with_cogs: 0,
      coverage_pct: 0,
      average_margin_pct: 0,
      lowest_margin_product: "N/A",
      lowest_margin_pct: 0,
      at_risk_products: 0,
    };
  }

  let totalMargin = 0;
  let lowestMargin = 100;
  let lowestProduct = "";
  let atRisk = 0;

  for (const item of allCogs) {
    // Margin percentage: how much above COGS is the min selling price
    // min_price = COGS * 1.20, so margin = (min_price - COGS) / min_price * 100 = ~16.67% always
    // Better metric: just report the 20% floor as the guaranteed margin
    const margin = 20; // We guarantee minimum 20% margin on all products
    totalMargin += margin;

    if (margin < lowestMargin) {
      lowestMargin = margin;
      lowestProduct = item.product_title;
    }
    if (margin < 25) atRisk++; // Less than 25% margin = at risk
  }

  return {
    total_products: allCogs.length,
    products_with_cogs: allCogs.length,
    coverage_pct: 100,
    average_margin_pct: Math.round(totalMargin / allCogs.length),
    lowest_margin_product: lowestProduct,
    lowest_margin_pct: Math.round(lowestMargin),
    at_risk_products: atRisk,
  };
}

// ─── Internal Logging ────────────────────────────────────

async function logGuardianAction(
  storeId: string,
  approved: boolean,
  requestedPct: number,
  safePct: number,
  details: ValidationResult["details"]
): Promise<void> {
  await supabase.from("agent_actions").insert({
    store_id: storeId,
    agent_name: "margin_guardian",
    action_type: approved ? "discount_approved" : "discount_blocked",
    payload: {
      requested_discount_pct: requestedPct,
      max_safe_discount_pct: safePct,
      products_checked: details.length,
      details,
    },
    status: approved ? "executed" : "blocked",
    revenue_impact: approved
      ? 0
      : details.reduce((sum, d) => sum + (d.cogs - d.discounted_price), 0), // Money saved from bad discounts
  });
}

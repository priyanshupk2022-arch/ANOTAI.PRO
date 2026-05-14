import { validateDiscount } from "./margin-guardian";
import { decideAgentAction, getOwnerControls } from "~/services/agent-controls.server";
import { askAgent } from "~/utils/gemini.server";
import { safeParseJson } from "~/utils/json.server";
import { supabase } from "~/utils/supabase.server";
import { ErrorLogger } from "~/services/errorLogger.server";

export type ShopperCatalogProduct = {
  id: string;
  title: string;
  price: number;
  category?: string;
  variant_id?: string;
  tags?: string[];
  ingredients?: string[];
  approved_claims?: string[];
  inventory_quantity?: number;
  in_stock?: boolean;
};

export type SkincareShopperInput = {
  concern: string;
  skinType?: string;
  budget?: number;
  preference?: string;
  sensitivity?: string;
  requestedProductTitle?: string;
  allowDiscount?: boolean;
};

export type RoutineRecommendation = {
  step: string;
  product_id: string;
  variant_id: string;
  title: string;
  price: number;
  reason: string;
  in_stock: boolean;
};

export interface BundleSuggestion {
  bundle_name: string;
  products: { product_id: string; variant_id: string; title: string; price: number }[];
  discount_pct: number;
  reasoning: string;
  total_before: number;
  total_after: number;
  savings: number;
  approval_required?: boolean;
  safety_note?: string;
}

export type SkincareConsultation = {
  headline: string;
  summary: string;
  routine: RoutineRecommendation[];
  alternatives: RoutineRecommendation[];
  bundle?: BundleSuggestion;
  questions: string[];
  safety_notes: string[];
  status: "ready" | "needs_more_info" | "approval_required";
};

const ROUTINE_STEPS = ["cleanser", "serum", "moisturizer", "sunscreen"];
const UNSAFE_CLAIM_PATTERNS = [
  /guarantee/i,
  /guaranteed/i,
  /fairness/i,
  /whiten/i,
  /cure/i,
  /treats?\s+(acne|eczema|rosacea|melasma|psoriasis)/i,
  /doctor\s+recommended/i,
  /dermatologist\s+approved/i,
  /clinically\s+proven/i,
  /only\s+\d+\s+left/i,
  /everyone\s+is\s+buying/i,
];

export async function getSkincareConsultation(
  storeId: string,
  input: SkincareShopperInput,
  catalog: ShopperCatalogProduct[]
): Promise<SkincareConsultation> {
  const controls = await getOwnerControls(storeId);
  const inStockCatalog = catalog.filter(isInStock);
  const requestedProduct = findRequestedProduct(input.requestedProductTitle, catalog);
  const routine = buildRoutine(input, inStockCatalog, controls.playbook.defaultRoutineSteps || ROUTINE_STEPS);
  const alternatives =
    requestedProduct && !isInStock(requestedProduct)
      ? findAlternatives(requestedProduct, input, inStockCatalog)
      : [];
  const safetyNotes = buildSafetyNotes(input);
  const questions = buildFollowUpQuestions(input);
  const bundle = input.allowDiscount
    ? await buildSafeSkincareBundle(storeId, input, routine, controls.safety.maxDiscountPct)
    : undefined;

  const status = bundle?.approval_required ? "approval_required" : questions.length > 0 ? "needs_more_info" : "ready";
  const summary = sanitizeSkincareCopy(
    await buildConsultationCopy(storeId, input, routine, alternatives, controls.playbook.brandVoice)
  );

  await supabase.from("agent_actions").insert({
    store_id: storeId,
    agent_name: "personal_shopper",
    action_type: "skincare_consultation",
    payload: {
      concern: normalizeText(input.concern),
      skin_type: normalizeText(input.skinType),
      requested_product: requestedProduct?.title || null,
      routine_count: routine.length,
      alternatives_count: alternatives.length,
      status,
    },
    status: status === "approval_required" ? "pending" : "executed",
    revenue_impact: 0,
  });

  return {
    headline: requestedProduct && !isInStock(requestedProduct)
      ? "Best in-stock alternatives for this skincare goal"
      : "Skincare routine matched to this shopper",
    summary,
    routine,
    alternatives,
    bundle,
    questions,
    safety_notes: safetyNotes,
    status,
  };
}

export async function getRecommendations(
  storeId: string,
  triggerProductId: string,
  catalog: ShopperCatalogProduct[]
): Promise<BundleSuggestion[]> {
  const triggerProduct = catalog.find((product) => product.id === triggerProductId);
  if (!triggerProduct) return [];

  const rawSuggestions = await callLLMForBundles(storeId, triggerProduct, catalog);
  const controls = await getOwnerControls(storeId);
  const validatedBundles: BundleSuggestion[] = [];

  for (const suggestion of rawSuggestions) {
    const variantIds = suggestion.products.map((product) => product.variant_id);
    const prices: Record<string, number> = {};
    suggestion.products.forEach((product) => {
      prices[product.variant_id] = product.price;
    });

    const guardianResult = await validateDiscount(storeId, variantIds, prices, suggestion.discount_pct);
    if (!guardianResult.approved && guardianResult.max_safe_discount_pct <= 0) {
      continue;
    }

    const finalDiscount = guardianResult.approved
      ? suggestion.discount_pct
      : guardianResult.max_safe_discount_pct;
    const adjusted = recalculateBundle({ ...suggestion, discount_pct: finalDiscount });
    const decision = decideAgentAction(controls, {
      agentName: "personal_shopper",
      discountPct: finalDiscount,
      estimatedRevenueImpact: adjusted.total_after,
    });

    validatedBundles.push({
      ...adjusted,
      approval_required: !decision.canExecute,
      safety_note: decision.reason,
    });
  }

  await supabase.from("agent_actions").insert({
    store_id: storeId,
    agent_name: "personal_shopper",
    action_type: "bundle_suggested",
    payload: {
      trigger_product: triggerProductId,
      bundles_count: validatedBundles.length,
      approval_required_count: validatedBundles.filter((bundle) => bundle.approval_required).length,
    },
    status: validatedBundles.some((bundle) => bundle.approval_required) ? "pending" : "executed",
    revenue_impact: 0,
  });

  return validatedBundles;
}

async function callLLMForBundles(
  storeId: string,
  triggerProduct: ShopperCatalogProduct,
  catalog: ShopperCatalogProduct[]
): Promise<BundleSuggestion[]> {
  const catalogStr = catalog
    .filter((product) => product.id !== triggerProduct.id && isInStock(product))
    .slice(0, 20)
    .map((product) =>
      `ID:${product.id} | "${product.title}" | $${product.price} | ${product.category || "skincare"} | tags:${(product.tags || []).join(",")}`
    )
    .join("\n");

  const prompt = `You are ANOTAI's ethical beauty/skincare personal shopper.

Customer is viewing:
"${triggerProduct.title}" at $${triggerProduct.price}

Available in-stock catalog:
${catalogStr}

Suggest 2-3 skincare bundles that increase order value while staying honest and safe.

Rules:
- Use only product IDs from the catalog.
- Each bundle should have 2-4 products including the viewed product.
- Prefer skincare routine logic: cleanser, serum/treatment, moisturizer, sunscreen.
- Suggest a discount of 5-15% only if it helps conversion.
- Do not claim fairness, skin whitening, medical cures, fake doctor approval, fake reviews, or fake urgency.
- Do not diagnose skin conditions.
- Use cautious benefit language based only on product titles/tags.

Return valid JSON array only:
[{
  "bundle_name": "...",
  "product_ids": ["id1", "id2"],
  "discount_pct": 10,
  "reasoning": "Short safe reason"
}]`;

  try {
    const response = await askAgent(storeId, prompt);
    const parsed = safeParseJson<any[]>(response, [], "skincare_bundle_generation", storeId, ErrorLogger);

    return parsed
      .map((bundle: any) => mapBundle(bundle, triggerProduct, catalog))
      .filter((bundle: BundleSuggestion | null): bundle is BundleSuggestion => Boolean(bundle));
  } catch (error) {
    console.error("Skincare bundle generation failed:", error);
    return buildFallbackBundles(triggerProduct, catalog);
  }
}

async function buildSafeSkincareBundle(
  storeId: string,
  input: SkincareShopperInput,
  routine: RoutineRecommendation[],
  maxDiscountPct: number
): Promise<BundleSuggestion | undefined> {
  if (routine.length < 2) return undefined;

  const products = routine.slice(0, 4).map((item) => ({
    product_id: item.product_id,
    variant_id: item.variant_id,
    title: item.title,
    price: item.price,
  }));
  const requestedDiscount = Math.min(10, maxDiscountPct);
  const bundle = recalculateBundle({
    bundle_name: `${toTitleCase(input.concern || "Skincare")} Routine`,
    products,
    discount_pct: requestedDiscount,
    reasoning: "A simple routine matched to the shopper concern using available products.",
    total_before: 0,
    total_after: 0,
    savings: 0,
  });
  const prices: Record<string, number> = {};
  products.forEach((product) => {
    prices[product.variant_id] = product.price;
  });

  const guardianResult = await validateDiscount(
    storeId,
    products.map((product) => product.variant_id),
    prices,
    requestedDiscount
  );

  if (!guardianResult.approved && guardianResult.max_safe_discount_pct <= 0) {
    return undefined;
  }

  const finalBundle = recalculateBundle({
    ...bundle,
    discount_pct: guardianResult.approved ? requestedDiscount : guardianResult.max_safe_discount_pct,
  });
  const controls = await getOwnerControls(storeId);
  const decision = decideAgentAction(controls, {
    agentName: "personal_shopper",
    discountPct: finalBundle.discount_pct,
    estimatedRevenueImpact: finalBundle.total_after,
  });

  return {
    ...finalBundle,
    approval_required: !decision.canExecute,
    safety_note: decision.reason,
  };
}

async function buildConsultationCopy(
  storeId: string,
  input: SkincareShopperInput,
  routine: RoutineRecommendation[],
  alternatives: RoutineRecommendation[],
  brandVoice: string
) {
  const baseCopy =
    routine.length > 0
      ? `Based on ${input.skinType || "the shopper's"} skin and ${input.concern || "their goal"}, this routine keeps the recommendation focused and easy to buy.`
      : "I need a little more skin and budget context before making a confident skincare recommendation.";

  if (!process.env.GEMINI_API_KEY || routine.length === 0) {
    return baseCopy;
  }

  const prompt = `Write 2 short sentences for a Shopify beauty personal shopper.
Voice: ${brandVoice}
Concern: ${input.concern || "unknown"}
Skin type: ${input.skinType || "unknown"}
Sensitivity: ${input.sensitivity || "unknown"}
Routine: ${routine.map((item) => `${item.step}: ${item.title}`).join("; ")}
Alternatives: ${alternatives.map((item) => item.title).join("; ") || "none"}

Rules:
- Do not make medical claims.
- Do not promise fairness, whitening, cures, or guaranteed results.
- Do not mention fake scarcity, fake reviews, or fake doctor approval.
- If sensitive skin is mentioned, include patch-test caution.
- Keep it honest and conversion-focused.`;

  try {
    return await askAgent(storeId, prompt);
  } catch {
    return baseCopy;
  }
}

function buildRoutine(
  input: SkincareShopperInput,
  catalog: ShopperCatalogProduct[],
  preferredSteps = ROUTINE_STEPS
): RoutineRecommendation[] {
  const concern = normalizeText(input.concern);
  const skinType = normalizeText(input.skinType);
  const budget = Number(input.budget || 0);
  const maxTotal = budget > 0 ? budget : Number.POSITIVE_INFINITY;
  const routine: RoutineRecommendation[] = [];
  let runningTotal = 0;

  for (const step of preferredSteps) {
    const product = findBestProductForStep(step, catalog, concern, skinType, maxTotal - runningTotal);
    if (!product) continue;

    runningTotal += product.price;
    routine.push(toRoutineRecommendation(step, product, buildProductReason(step, product, concern, skinType)));
  }

  return routine;
}

function findBestProductForStep(
  step: string,
  catalog: ShopperCatalogProduct[],
  concern: string,
  skinType: string,
  remainingBudget: number
) {
  return catalog
    .filter((product) => product.price <= remainingBudget)
    .map((product) => ({ product, score: scoreProduct(product, step, concern, skinType) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.product.price - b.product.price)[0]?.product;
}

function findAlternatives(
  requestedProduct: ShopperCatalogProduct,
  input: SkincareShopperInput,
  catalog: ShopperCatalogProduct[]
) {
  const category = normalizeText(requestedProduct.category);
  const concern = normalizeText(input.concern);
  const skinType = normalizeText(input.skinType);

  return catalog
    .map((product) => ({
      product,
      score:
        scoreProduct(product, category, concern, skinType) +
        sharedTags(product, requestedProduct) * 2 -
        Math.abs(product.price - requestedProduct.price) / 25,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) =>
      toRoutineRecommendation(
        item.product.category || "alternative",
        item.product,
        "Closest in-stock match based on the shopper's need and product category."
      )
    );
}

function scoreProduct(product: ShopperCatalogProduct, step: string, concern: string, skinType: string) {
  const haystack = normalizeText([
    product.title,
    product.category,
    ...(product.tags || []),
    ...(product.ingredients || []),
    ...(product.approved_claims || []),
  ].join(" "));
  let score = 0;

  for (const token of [step, concern, skinType].filter(Boolean)) {
    for (const word of token.split(" ").filter((part) => part.length > 2)) {
      if (haystack.includes(word)) score += 2;
    }
  }

  if (step === "serum" && /serum|vitamin|niacinamide|hyaluronic|treatment/.test(haystack)) score += 4;
  if (step === "cleanser" && /cleanser|wash|foam/.test(haystack)) score += 4;
  if (step === "moisturizer" && /moisturizer|cream|lotion|barrier/.test(haystack)) score += 4;
  if (step === "sunscreen" && /sunscreen|spf/.test(haystack)) score += 4;
  if (/sensitive/.test(skinType) && /fragrance|peel|acid|retinol/.test(haystack)) score -= 3;

  return score;
}

function buildFallbackBundles(
  triggerProduct: ShopperCatalogProduct,
  catalog: ShopperCatalogProduct[]
): BundleSuggestion[] {
  const products = [triggerProduct, ...catalog.filter((product) => product.id !== triggerProduct.id && isInStock(product)).slice(0, 2)]
    .map((product) => ({
      product_id: product.id,
      variant_id: product.variant_id || product.id,
      title: product.title,
      price: product.price,
    }));

  if (products.length < 2) return [];

  return [
    recalculateBundle({
      bundle_name: "Skincare Routine Set",
      products,
      discount_pct: 5,
      reasoning: "A conservative routine bundle using available products.",
      total_before: 0,
      total_after: 0,
      savings: 0,
    }),
  ];
}

function mapBundle(
  bundle: any,
  triggerProduct: ShopperCatalogProduct,
  catalog: ShopperCatalogProduct[]
): BundleSuggestion | null {
  const productIds = Array.isArray(bundle.product_ids) ? bundle.product_ids : [];
  const bundleProducts = productIds
    .map((id: string) => catalog.find((product) => product.id === id && isInStock(product)))
    .filter(Boolean)
    .map((product: ShopperCatalogProduct) => ({
      product_id: product.id,
      variant_id: product.variant_id || product.id,
      title: product.title,
      price: product.price,
    }));

  if (!bundleProducts.some((product: { product_id: string }) => product.product_id === triggerProduct.id)) {
    bundleProducts.unshift({
      product_id: triggerProduct.id,
      variant_id: triggerProduct.variant_id || triggerProduct.id,
      title: triggerProduct.title,
      price: triggerProduct.price,
    });
  }

  if (bundleProducts.length < 2) return null;

  return recalculateBundle({
    bundle_name: sanitizeSkincareCopy(String(bundle.bundle_name || "Skincare Routine Set")),
    products: bundleProducts.slice(0, 4),
    discount_pct: clampNumber(Number(bundle.discount_pct), 0, 15),
    reasoning: sanitizeSkincareCopy(String(bundle.reasoning || "Complements the shopper's skincare routine.")),
    total_before: 0,
    total_after: 0,
    savings: 0,
  });
}

function recalculateBundle(bundle: BundleSuggestion): BundleSuggestion {
  const totalBefore = bundle.products.reduce((sum, product) => sum + product.price, 0);
  const discountPct = clampNumber(bundle.discount_pct, 0, 15);
  const totalAfter = totalBefore * (1 - discountPct / 100);

  return {
    ...bundle,
    discount_pct: discountPct,
    total_before: roundMoney(totalBefore),
    total_after: roundMoney(totalAfter),
    savings: roundMoney(totalBefore - totalAfter),
    reasoning: sanitizeSkincareCopy(bundle.reasoning),
  };
}

function toRoutineRecommendation(step: string, product: ShopperCatalogProduct, reason: string): RoutineRecommendation {
  return {
    step,
    product_id: product.id,
    variant_id: product.variant_id || product.id,
    title: product.title,
    price: product.price,
    reason: sanitizeSkincareCopy(reason),
    in_stock: isInStock(product),
  };
}

function buildProductReason(step: string, product: ShopperCatalogProduct, concern: string, skinType: string) {
  const claim = product.approved_claims?.[0];
  if (claim) return claim;

  return `${product.title} fits the ${step} step${concern ? ` for ${concern}` : ""}${skinType ? ` and ${skinType} skin` : ""}.`;
}

function buildFollowUpQuestions(input: SkincareShopperInput) {
  const questions: string[] = [];
  if (!input.skinType) questions.push("What is your skin type: oily, dry, combination, or sensitive?");
  if (!input.concern) questions.push("What is the main skincare goal: acne, dryness, dullness, dark spots, or daily glow?");
  if (!input.budget) questions.push("What budget should the routine stay under?");
  return questions.slice(0, 3);
}

function buildSafetyNotes(input: SkincareShopperInput) {
  const notes = [
    "Recommendations use store product data and avoid medical or guaranteed-result claims.",
  ];
  const sensitivity = normalizeText(input.sensitivity);
  const skinType = normalizeText(input.skinType);

  if (sensitivity || skinType.includes("sensitive")) {
    notes.push("For sensitive skin, patch test before using a new skincare product.");
  }

  if (/pregnan|medication|eczema|rosacea|psoriasis|allerg/.test(`${sensitivity} ${skinType}`)) {
    notes.push("For pregnancy, allergies, medication, or diagnosed skin conditions, consult a qualified professional.");
  }

  return notes;
}

function findRequestedProduct(title: string | undefined, catalog: ShopperCatalogProduct[]) {
  const requested = normalizeText(title);
  if (!requested) return undefined;
  return catalog.find((product) => normalizeText(product.title).includes(requested));
}

function sharedTags(a: ShopperCatalogProduct, b: ShopperCatalogProduct) {
  const bTags = new Set((b.tags || []).map(normalizeText));
  return (a.tags || []).filter((tag) => bTags.has(normalizeText(tag))).length;
}

function isInStock(product: ShopperCatalogProduct) {
  if (typeof product.in_stock === "boolean") return product.in_stock;
  if (typeof product.inventory_quantity === "number") return product.inventory_quantity > 0;
  return true;
}

export function sanitizeSkincareCopy(value: string) {
  let output = value.trim().replace(/\s+/g, " ");
  for (const pattern of UNSAFE_CLAIM_PATTERNS) {
    output = output.replace(pattern, "supports a healthier-looking routine");
  }
  return output;
}

function normalizeText(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function toTitleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export async function trackBundleImpression(storeId: string, bundleName: string): Promise<void> {
  await supabase.from("agent_actions").insert({
    store_id: storeId,
    agent_name: "personal_shopper",
    action_type: "bundle_impression",
    payload: { bundle_name: sanitizeSkincareCopy(bundleName) },
    status: "executed",
    revenue_impact: 0,
  });
}

export async function trackBundleAccepted(storeId: string, bundleName: string, revenue: number): Promise<void> {
  await supabase.from("agent_actions").insert({
    store_id: storeId,
    agent_name: "personal_shopper",
    action_type: "bundle_accepted",
    payload: { bundle_name: sanitizeSkincareCopy(bundleName) },
    status: "executed",
    revenue_impact: revenue,
  });
}

export async function getShopperMetrics(storeId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data: actions } = await supabase
    .from("agent_actions")
    .select("action_type, revenue_impact")
    .eq("store_id", storeId)
    .eq("agent_name", "personal_shopper")
    .gte("created_at", since);

  const impressions = actions?.filter((action) => action.action_type === "bundle_impression").length || 0;
  const accepted = actions?.filter((action) => action.action_type === "bundle_accepted").length || 0;
  const consultations = actions?.filter((action) => action.action_type === "skincare_consultation").length || 0;
  const revenue =
    actions
      ?.filter((action) => action.action_type === "bundle_accepted")
      .reduce((sum, action) => sum + (Number(action.revenue_impact) || 0), 0) || 0;

  return {
    total_impressions: impressions + consultations,
    total_accepted: accepted,
    total_consultations: consultations,
    acceptance_rate: (impressions + consultations) > 0 ? Math.round((accepted / (impressions + consultations)) * 100) : 0,
    revenue_generated: revenue,
  };
}

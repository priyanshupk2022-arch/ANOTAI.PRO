/**
 * 🔮 RETENTION & INTENT ENGINE — Agent 4: Post-Purchase & High-Intent Retargeting
 * 
 * The Spy: Tracks customer search queries via Shopify Web Pixels.
 * The Matcher: When new products are created, matches them against stored intents.
 * The Closer: Sends targeted VIP early-access emails ONLY to matched users.
 * 
 * Flow: Search Tracked → Intent Stored → New Product → Keywords Matched → VIP Email Sent
 */

import { supabase } from "~/utils/supabase.server";
import { askAgent } from "~/utils/gemini.server";
import { safeParseJson } from "~/utils/json.server";
import { sendEmail } from "~/services/email.server";
import { ErrorLogger } from "~/services/errorLogger.server";
import { assertCanSendEmail, assertCanMakeAiCall } from "~/services/kill-switch.server";
import { decideAgentAction, getOwnerControls } from "~/services/agent-controls.server";
import { recordCustomerActivity, upsertCustomerProfile } from "~/services/customer-data.server";

// ─── Types ───────────────────────────────────────────────
export interface CustomerIntent {
  id: string;
  store_id: string;
  customer_email: string;
  search_query: string;
  created_at: string;
}

export interface IntentMatch {
  customer_email: string;
  search_query: string;
  product_title: string;
  match_score: number;
}

export interface VIPDropResult {
  product_id: string;
  product_title: string;
  keywords_extracted: string[];
  intents_matched: number;
  emails_sent: number;
}

// ─── Step 1: Intent Capture (from Web Pixel) ─────────────

/**
 * Save a customer's search query from the storefront Web Pixel.
 * Called when search_submitted event fires.
 */
export async function captureSearchIntent(
  storeId: string,
  customerEmail: string,
  searchQuery: string
): Promise<void> {
  if (!customerEmail || !searchQuery || searchQuery.trim().length < 2) return;

  // Deduplicate: don't store the same search from the same user within 24hrs
  const since = new Date(Date.now() - 86400000).toISOString();
  const { data: existing } = await supabase
    .from("customer_intents")
    .select("id")
    .eq("store_id", storeId)
    .eq("customer_email", customerEmail.toLowerCase())
    .eq("search_query", searchQuery.toLowerCase().trim())
    .gte("created_at", since)
    .limit(1);

  if (existing && existing.length > 0) return; // Already captured

  const customerId = await upsertCustomerProfile({
    storeId,
    email: customerEmail,
    metadata: { source: "web_pixel" },
  });

  await supabase.from("customer_intents").insert({
    store_id: storeId,
    customer_email: customerEmail.toLowerCase(),
    search_query: searchQuery.toLowerCase().trim(),
  });

  await recordCustomerActivity({
    storeId,
    customerId,
    activityType: "search_intent",
    payload: { query: searchQuery.toLowerCase().trim() },
  });

  await logIntentAction(storeId, "search_captured", {
    email: customerEmail,
    query: searchQuery,
  });
}

// ─── Step 2: Product Keyword Extraction ──────────────────

/**
 * Extract keywords from a new product using Gemini AI.
 * Called when products/create webhook fires.
 */
export async function extractProductKeywords(
  storeId: string,
  productTitle: string,
  productDescription: string,
  productTags: string[]
): Promise<string[]> {
  const prompt = `Extract 5-10 search keywords a customer would type to find this product.

Product: "${productTitle}"
Description: ${productDescription?.substring(0, 300) || "N/A"}
Tags: ${productTags.join(", ") || "none"}

Rules:
- Return ONLY a JSON array of lowercase keywords
- Include singular and plural forms
- Include common synonyms and abbreviations
- Think like a customer searching, not a marketer

Example output: ["leather jacket", "jacket", "black jacket", "men jacket", "leather coat"]`;

  try {
    const response = await askAgent(storeId, prompt);
    const keywords = safeParseJson<string[]>(response, [], "product_keyword_extraction", storeId, ErrorLogger);
    if (keywords.length > 0) {
      return keywords.map((k: string) => k.toLowerCase().trim()).filter(Boolean);
    }
  } catch (error) {
    console.error("Keyword extraction failed, using fallback:", error);
  }

  // Fallback: split title into words + use tags
  const titleWords = productTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const tagWords = productTags.map((t) => t.toLowerCase());
  return [...new Set([...titleWords, ...tagWords, productTitle.toLowerCase()])];
}

// ─── Step 3: Intent Matching & VIP Drop ──────────────────

/**
 * Main entry: Match a new product against stored customer intents
 * and send targeted VIP emails.
 */
export async function executeVIPDrop(
  storeId: string,
  productId: string,
  productTitle: string,
  productDescription: string,
  productTags: string[],
  productPrice: number,
  productUrl: string,
  productImageUrl?: string
): Promise<VIPDropResult> {
  // Step A: Extract keywords from the new product
  const keywords = await extractProductKeywords(storeId, productTitle, productDescription, productTags);

  if (keywords.length === 0) {
    return { product_id: productId, product_title: productTitle, keywords_extracted: [], intents_matched: 0, emails_sent: 0 };
  }

  // Step B: Query customer_intents for matching search queries (last 90 days)
  const since90Days = new Date(Date.now() - 90 * 86400000).toISOString();
  const matches: IntentMatch[] = [];

  // Build OR query: find intents where search_query contains any keyword
  for (const keyword of keywords) {
    const { data: intents } = await supabase
      .from("customer_intents")
      .select("customer_email, search_query")
      .eq("store_id", storeId)
      .ilike("search_query", `%${keyword}%`)
      .gte("created_at", since90Days);

    if (intents) {
      for (const intent of intents) {
        // Avoid duplicate emails to same customer
        if (!matches.some((m) => m.customer_email === intent.customer_email)) {
          matches.push({
            customer_email: intent.customer_email,
            search_query: intent.search_query,
            product_title: productTitle,
            match_score: calculateMatchScore(intent.search_query, keywords),
          });
        }
      }
    }
  }

  // Sort by match score, take top 50 (don't mass email)
  const topMatches = matches
    .filter((m) => m.match_score >= 40) // Minimum relevance threshold
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 50);

  const controls = await getOwnerControls(storeId);
  const decision = decideAgentAction(controls, {
    agentName: "retention_engine",
    emailCount: topMatches.length,
  });

  if (!decision.canExecute) {
    await logIntentAction(
      storeId,
      decision.status === "blocked" ? "vip_drop_blocked" : "vip_drop_queued",
      {
        product_id: productId,
        product_title: productTitle,
        keywords,
        intents_matched: topMatches.length,
        owner_mode: decision.mode,
        reason: decision.reason,
      },
      decision.status
    );

    return {
      product_id: productId,
      product_title: productTitle,
      keywords_extracted: keywords,
      intents_matched: topMatches.length,
      emails_sent: 0,
    };
  }

  // Step C: Send VIP early-access emails
  let emailsSent = 0;
  
  // Phase 10: Global & Store safety gate
  try {
    await assertCanSendEmail(storeId);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Safety gate blocked VIP drop.";
    await logIntentAction(storeId, "vip_drop_blocked", { reason: msg }, "blocked");
    return { product_id: productId, product_title: productTitle, keywords_extracted: keywords, intents_matched: topMatches.length, emails_sent: 0 };
  }

  for (const match of topMatches) {
    const emailContent = await generateVIPEmail(storeId, match, productPrice, productUrl, productImageUrl);
    const result = await sendEmail({
      to: match.customer_email,
      subject: emailContent.subject,
      html: emailContent.html,
      tags: [
        { name: "type", value: "vip_drop" },
        { name: "product_id", value: productId },
      ],
    });

    if (result.status === "sent") emailsSent++;

    const customerId = await upsertCustomerProfile({
      storeId,
      email: match.customer_email,
      metadata: { source: "vip_drop" },
    });

    await recordCustomerActivity({
      storeId,
      customerId,
      activityType: "email_sent",
      payload: {
        type: "vip_drop",
        product_id: productId,
        product_title: productTitle,
        search_query: match.search_query,
      },
    });
  }

  // Log the VIP drop
  await logIntentAction(storeId, "vip_drop_executed", {
    product_id: productId,
    product_title: productTitle,
    keywords: keywords,
    intents_matched: topMatches.length,
    emails_sent: emailsSent,
  });

  return {
    product_id: productId,
    product_title: productTitle,
    keywords_extracted: keywords,
    intents_matched: topMatches.length,
    emails_sent: emailsSent,
  };
}

// ─── VIP Email Generation ────────────────────────────────

async function generateVIPEmail(
  storeId: string,
  match: IntentMatch,
  productPrice: number,
  productUrl: string,
  productImageUrl?: string
): Promise<{ subject: string; html: string }> {
  const prompt = `Write a short, exclusive VIP early-access email for a customer who previously searched for "${match.search_query}".

The product that matches their search: "${match.product_title}" at $${productPrice.toFixed(2)}
Product link: ${productUrl}

Rules:
- Make it feel exclusive ("You searched for this", "Just for you", "VIP early access")
- Reference their original search query naturally
- Keep it under 100 words
- Clear CTA button to the product
- Return valid JSON: {"subject": "...", "html": "..."}
- Clean, minimal HTML with inline CSS`;

  try {
    const response = await askAgent(storeId, prompt);
    const parsed = safeParseJson<{ subject: string; html: string } | null>(
      response,
      null,
      "vip_email_generation",
      storeId,
      ErrorLogger
    );
    if (parsed) return parsed;
  } catch (error) {
    console.error("VIP email generation failed:", error);
  }

  // Fallback
  return {
    subject: `We found what you were looking for: "${match.product_title}" ✨`,
    html: `<div style="font-family:'Inter',system-ui,sans-serif;max-width:600px;margin:0 auto;padding:32px;">
      <p style="color:#64748B;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;">VIP Early Access</p>
      <h2 style="margin:0 0 16px;color:#1a1a1a;">Remember when you searched for "${match.search_query}"?</h2>
      <p style="color:#4B5563;">We just got something you'll love.</p>
      ${productImageUrl ? `<img src="${productImageUrl}" style="width:100%;border-radius:12px;margin:16px 0;" alt="${match.product_title}"/>` : ""}
      <h3 style="margin:16px 0 4px;">${match.product_title}</h3>
      <p style="font-size:24px;font-weight:700;margin:0 0 16px;color:#1a1a1a;">$${productPrice.toFixed(2)}</p>
      <a href="${productUrl}" style="display:inline-block;padding:14px 32px;background:#1a1a1a;color:#FFF;border-radius:8px;text-decoration:none;font-weight:600;">Shop Now →</a>
      <p style="color:#94A3B8;font-size:12px;margin-top:24px;">You're receiving this because you showed interest. Not a mass email.</p>
    </div>`,
  };
}

// ─── Metrics ─────────────────────────────────────────────

export async function getIntentMetrics(storeId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { count: totalIntents } = await supabase
    .from("customer_intents")
    .select("*", { count: "exact", head: true })
    .eq("store_id", storeId)
    .gte("created_at", since);

  const { data: actions } = await supabase
    .from("agent_actions")
    .select("action_type, payload, revenue_impact")
    .eq("store_id", storeId)
    .eq("agent_name", "retention_engine")
    .gte("created_at", since);

  const drops = actions?.filter((a) => a.action_type === "vip_drop_executed").length || 0;
  const emailsSent = actions?.filter((a) => a.action_type === "vip_drop_executed")
    .reduce((s, a) => s + (a.payload?.emails_sent || 0), 0) || 0;

  return {
    total_intents_captured: totalIntents || 0,
    vip_drops_executed: drops,
    targeted_emails_sent: emailsSent,
  };
}

// ─── Helpers ─────────────────────────────────────────────

function calculateMatchScore(searchQuery: string, productKeywords: string[]): number {
  const queryWords = searchQuery.toLowerCase().split(/\s+/);
  let matchedWords = 0;

  for (const word of queryWords) {
    if (productKeywords.some((kw) => kw.includes(word) || word.includes(kw))) {
      matchedWords++;
    }
  }

  return queryWords.length > 0 ? Math.round((matchedWords / queryWords.length) * 100) : 0;
}

async function logIntentAction(
  storeId: string,
  type: string,
  payload: any,
  status: "pending" | "approved" | "executed" | "blocked" = "executed"
): Promise<void> {
  await supabase.from("agent_actions").insert({
    store_id: storeId,
    agent_name: "retention_engine",
    action_type: type,
    payload,
    status,
    revenue_impact: 0,
  });
}

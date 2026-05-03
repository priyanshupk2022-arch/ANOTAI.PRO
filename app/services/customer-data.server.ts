import { supabase } from "~/utils/supabase.server";

export type CustomerActivityType =
  | "search_intent"
  | "cart_abandoned"
  | "cart_recovered"
  | "order_created"
  | "product_interest"
  | "email_sent";

export type UpsertCustomerInput = {
  storeId: string;
  email?: string | null;
  shopifyCustomerId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  marketingOptIn?: boolean;
  metadata?: Record<string, unknown>;
};

export async function upsertCustomerProfile(input: UpsertCustomerInput): Promise<string | null> {
  const email = normalizeEmail(input.email);
  const shopifyCustomerId = normalizeOptional(input.shopifyCustomerId);

  if (!email && !shopifyCustomerId) return null;

  const payload = {
    store_id: input.storeId,
    shopify_customer_id: shopifyCustomerId,
    email,
    first_name: normalizeOptional(input.firstName),
    last_name: normalizeOptional(input.lastName),
    marketing_opt_in: input.marketingOptIn ?? false,
    metadata: input.metadata || {},
    last_seen_at: new Date().toISOString(),
  };

  const conflictTarget = email ? "store_id,email" : "store_id,shopify_customer_id";
  const { data, error } = await supabase
    .from("customers")
    .upsert(payload, { onConflict: conflictTarget })
    .select("id")
    .single();

  if (error) {
    console.error("Customer profile upsert failed:", error.message);
    return null;
  }

  return data?.id || null;
}

export async function recordCustomerActivity(input: {
  storeId: string;
  customerId?: string | null;
  activityType: CustomerActivityType;
  payload?: Record<string, unknown>;
}) {
  const { error } = await supabase.from("customer_activities").insert({
    store_id: input.storeId,
    customer_id: input.customerId || null,
    activity_type: input.activityType,
    payload: input.payload || {},
  });

  if (error) {
    console.error("Customer activity insert failed:", error.message);
  }
}

export async function getCustomerSignalSummary(storeId: string) {
  const since7Days = new Date(Date.now() - 7 * 86400000).toISOString();

  const [customers, searches, carts, recovered, emails] = await Promise.all([
    countRows("customers", storeId),
    countActivities(storeId, "search_intent", since7Days),
    countActivities(storeId, "cart_abandoned", since7Days),
    countActivities(storeId, "cart_recovered", since7Days),
    countActivities(storeId, "email_sent", since7Days),
  ]);

  return {
    customers,
    searches7d: searches,
    abandonedCarts7d: carts,
    recoveredCarts7d: recovered,
    emailsSent7d: emails,
  };
}

async function countRows(table: "customers", storeId: string) {
  const { count } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("store_id", storeId);

  return count || 0;
}

async function countActivities(
  storeId: string,
  activityType: CustomerActivityType,
  since: string
) {
  const { count } = await supabase
    .from("customer_activities")
    .select("*", { count: "exact", head: true })
    .eq("store_id", storeId)
    .eq("activity_type", activityType)
    .gte("created_at", since);

  return count || 0;
}

function normalizeEmail(email?: string | null) {
  const value = email?.trim().toLowerCase();
  return value || null;
}

function normalizeOptional(value?: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

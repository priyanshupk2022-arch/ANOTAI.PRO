import db from "~/db.server";
import { removeStoreByShopDomain } from "~/utils/store.server";
import { supabase } from "~/utils/supabase.server";

type ShopifyCustomerPayload = {
  shop_domain?: string;
  customer?: {
    id?: number | string;
    email?: string | null;
  };
  data_request?: {
    id?: number | string;
  };
  orders_requested?: Array<number | string>;
  orders_to_redact?: Array<number | string>;
};

type StoreRecord = {
  id: string;
  shop_domain: string;
};

export async function recordCustomerDataRequest(
  shopDomain: string,
  payload: ShopifyCustomerPayload
) {
  const store = await findStore(shopDomain || payload.shop_domain);
  if (!store) {
    console.warn(`Privacy data request received for unknown shop: ${shopDomain}`);
    return;
  }

  const customer = normalizeCustomerIdentity(payload);

  await supabase.from("agent_actions").insert({
    store_id: store.id,
    agent_name: "revenue_analyst",
    action_type: "privacy_data_request",
    payload: {
      data_request_id: payload.data_request?.id ? String(payload.data_request.id) : null,
      customer_shopify_id: customer.shopifyCustomerId,
      customer_email: customer.email,
      orders_requested: payload.orders_requested || [],
    },
    status: "executed",
  });
}

export async function redactCustomerData(
  shopDomain: string,
  payload: ShopifyCustomerPayload
) {
  const store = await findStore(shopDomain || payload.shop_domain);
  if (!store) {
    console.warn(`Customer redaction received for unknown shop: ${shopDomain}`);
    return;
  }

  const customer = normalizeCustomerIdentity(payload);
  const customerIds = await findCustomerIds(store.id, customer);

  await deleteCustomerLinkedRows(store.id, customerIds, customer.email);
}

export async function redactShopData(shopDomain: string) {
  if (!shopDomain) {
    console.warn("Shop redaction received without shop domain.");
    return;
  }

  await db.session.deleteMany({ where: { shop: shopDomain } });
  await removeStoreByShopDomain(shopDomain);
}

async function findStore(shopDomain?: string | null): Promise<StoreRecord | null> {
  const normalizedShop = shopDomain?.trim().toLowerCase();
  if (!normalizedShop) return null;

  const { data, error } = await supabase
    .from("stores")
    .select("id, shop_domain")
    .eq("shop_domain", normalizedShop)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read store for privacy webhook: ${error.message}`);
  }

  return data;
}

async function findCustomerIds(
  storeId: string,
  customer: { shopifyCustomerId: string | null; email: string | null }
) {
  const ids = new Set<string>();

  if (customer.shopifyCustomerId) {
    const { data, error } = await supabase
      .from("customers")
      .select("id")
      .eq("store_id", storeId)
      .eq("shopify_customer_id", customer.shopifyCustomerId);

    if (error) {
      throw new Error(`Failed to find customer by Shopify ID: ${error.message}`);
    }

    data?.forEach((row) => ids.add(row.id));
  }

  if (customer.email) {
    const { data, error } = await supabase
      .from("customers")
      .select("id")
      .eq("store_id", storeId)
      .eq("email", customer.email);

    if (error) {
      throw new Error(`Failed to find customer by email: ${error.message}`);
    }

    data?.forEach((row) => ids.add(row.id));
  }

  return Array.from(ids);
}

async function deleteCustomerLinkedRows(
  storeId: string,
  customerIds: string[],
  email: string | null
) {
  const customerEmails = new Set<string>();
  if (email) customerEmails.add(email);

  if (customerIds.length > 0) {
    const { data, error } = await supabase
      .from("customers")
      .select("email")
      .eq("store_id", storeId)
      .in("id", customerIds);

    if (error) {
      throw new Error(`Failed to read customer emails for redaction: ${error.message}`);
    }

    data?.forEach((row) => {
      const normalizedEmail = normalizeEmail(row.email);
      if (normalizedEmail) customerEmails.add(normalizedEmail);
    });
  }

  if (customerIds.length > 0) {
    await assertNoSupabaseError(
      supabase.from("customer_activities").delete().eq("store_id", storeId).in("customer_id", customerIds),
      "customer activities"
    );

    await deleteCustomerIntentsByCustomerIds(storeId, customerIds, Array.from(customerEmails));

    await assertNoSupabaseError(
      supabase.from("customers").delete().eq("store_id", storeId).in("id", customerIds),
      "customer profiles"
    );
  }

  for (const customerEmail of customerEmails) {
    await deleteCustomerIntentsByEmail(storeId, customerEmail);

    await assertNoSupabaseError(
      supabase.from("cart_events").delete().eq("store_id", storeId).eq("customer_email", customerEmail),
      "cart events"
    );
  }
}

async function assertNoSupabaseError<T>(
  operation: PromiseLike<{ error: { message: string } | null } & T>,
  label: string
) {
  const { error } = await operation;
  if (error) {
    throw new Error(`Failed to redact ${label}: ${error.message}`);
  }
}

async function deleteCustomerIntentsByCustomerIds(
  storeId: string,
  customerIds: string[],
  fallbackEmails: string[]
) {
  const { error } = await supabase
    .from("customer_intents")
    .delete()
    .eq("store_id", storeId)
    .in("customer_id", customerIds);

  if (!error) return;

  if (isMissingColumnError(error, "customer_id")) {
    console.warn("Customer intents customer_id column is missing; using email-based redaction.");
    for (const email of fallbackEmails) {
      await deleteCustomerIntentsByEmail(storeId, email);
    }
    return;
  }

  throw new Error(`Failed to redact customer intents by customer ID: ${error.message}`);
}

async function deleteCustomerIntentsByEmail(storeId: string, email: string) {
  await assertNoSupabaseError(
    supabase.from("customer_intents").delete().eq("store_id", storeId).eq("customer_email", email),
    "customer intents by email"
  );
}

function isMissingColumnError(error: { code?: string; message: string }, columnName: string) {
  return error.code === "42703" || error.message.includes(columnName);
}

function normalizeCustomerIdentity(payload: ShopifyCustomerPayload) {
  return {
    shopifyCustomerId: payload.customer?.id ? String(payload.customer.id) : null,
    email: normalizeEmail(payload.customer?.email),
  };
}

function normalizeEmail(email?: string | null) {
  const value = email?.trim().toLowerCase();
  return value || null;
}

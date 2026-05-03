import { supabase } from "~/utils/supabase.server";

const STORE_SYNC_TIMEOUT_MS = 15000;

type ShopifySessionLike = {
  shop: string;
  accessToken?: string | null;
};

async function withStoreSyncTimeout<T>(operation: PromiseLike<T>, shopDomain: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            new Error(
              `Timed out syncing Supabase store for ${shopDomain} after ${STORE_SYNC_TIMEOUT_MS}ms`
            )
          );
        }, STORE_SYNC_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export async function ensureStoreForSession(session: ShopifySessionLike) {
  const shopDomain = session.shop;

  if (!shopDomain) {
    throw new Error("Cannot sync store without a shop domain.");
  }

  const { data, error } = await withStoreSyncTimeout(
    supabase
      .from("stores")
      .upsert(
        {
          shop_domain: shopDomain,
          access_token: session.accessToken || "",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "shop_domain" }
      )
      .select("id, shop_domain, plan_status")
      .single(),
    shopDomain
  );

  if (error) {
    throw new Error(`Failed to sync Supabase store for ${shopDomain}: ${error.message}`);
  }

  return data;
}

export async function removeStoreByShopDomain(shopDomain: string) {
  if (!shopDomain) return;

  const { error } = await withStoreSyncTimeout(
    supabase.from("stores").delete().eq("shop_domain", shopDomain),
    shopDomain
  );

  if (error) {
    throw new Error(`Failed to remove Supabase store for ${shopDomain}: ${error.message}`);
  }
}

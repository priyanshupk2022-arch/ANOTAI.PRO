import { supabase } from "~/utils/supabase.server";

type StoreCredentials = {
  shop_domain: string;
  access_token: string;
};

export type DiscountCreateInput = {
  storeId: string;
  code: string;
  discountPct: number;
  startsAt: Date;
  endsAt: Date;
};

export type DiscountCreateResult = {
  id: string;
  code: string;
};

const SHOPIFY_API_VERSION = "2026-04";
const MAX_DISCOUNT_ATTEMPTS = 3;

export async function createShopifyRecoveryDiscount(
  input: DiscountCreateInput
): Promise<DiscountCreateResult> {
  const store = await getStoreCredentials(input.storeId);
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_DISCOUNT_ATTEMPTS; attempt += 1) {
    try {
      return await createBasicDiscount(store, input);
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown Shopify discount error";
      if (attempt < MAX_DISCOUNT_ATTEMPTS) {
        await wait(attempt * 350);
      }
    }
  }

  throw new Error(`DISCOUNT_CREATE_FAILED: ${lastError}`);
}

async function getStoreCredentials(storeId: string): Promise<StoreCredentials> {
  const { data, error } = await supabase
    .from("stores")
    .select("shop_domain, access_token")
    .eq("id", storeId)
    .single();

  if (error || !data?.shop_domain || !data?.access_token) {
    throw new Error("Store credentials are not available for Shopify discount creation.");
  }

  return data as StoreCredentials;
}

async function createBasicDiscount(
  store: StoreCredentials,
  input: DiscountCreateInput
): Promise<DiscountCreateResult> {
  const response = await fetch(
    `https://${store.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": store.access_token,
      },
      body: JSON.stringify({
        query: `#graphql
          mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
            discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
              codeDiscountNode {
                id
                codeDiscount {
                  ... on DiscountCodeBasic {
                    title
                    codes(first: 1) {
                      nodes {
                        code
                      }
                    }
                  }
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        variables: {
          basicCodeDiscount: {
            title: `ANOTAI recovery ${input.code}`,
            code: input.code,
            startsAt: input.startsAt.toISOString(),
            endsAt: input.endsAt.toISOString(),
            customerSelection: {
              all: true,
            },
            customerGets: {
              value: {
                percentage: input.discountPct / 100,
              },
              items: {
                all: true,
              },
            },
            appliesOncePerCustomer: true,
            usageLimit: 1,
          },
        },
      }),
    }
  );

  const body = await response.json();

  if (!response.ok) {
    throw new Error(body?.errors?.[0]?.message || `Shopify returned HTTP ${response.status}`);
  }

  const result = body?.data?.discountCodeBasicCreate;
  const userErrors = result?.userErrors || [];
  if (userErrors.length > 0) {
    throw new Error(userErrors.map((error: any) => error.message).join("; "));
  }

  const id = result?.codeDiscountNode?.id;
  const code = result?.codeDiscountNode?.codeDiscount?.codes?.nodes?.[0]?.code || input.code;

  if (!id) {
    throw new Error("Shopify did not return a discount id.");
  }

  return { id, code };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

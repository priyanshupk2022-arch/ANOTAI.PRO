type AdminApiContext = {
  graphql: (query: string, options?: { variables?: Record<string, any> }) => Promise<Response>;
};

const PLAN_NAME = "ANOTAI Elite Agency";
const PLAN_PRICE = 999.0;
const TRIAL_DAYS = 7;
const BILLING_TEST_MODE = process.env.SHOPIFY_BILLING_TEST !== "false";

export async function createBillingCharge(
  admin: AdminApiContext,
  returnUrl: string
): Promise<string> {
  const response = await admin.graphql(
    `#graphql
    mutation appSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $trialDays: Int, $test: Boolean) {
      appSubscriptionCreate(
        name: $name
        lineItems: $lineItems
        returnUrl: $returnUrl
        trialDays: $trialDays
        test: $test
      ) {
        appSubscription {
          id
          status
        }
        confirmationUrl
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        name: PLAN_NAME,
        returnUrl,
        trialDays: TRIAL_DAYS,
        test: BILLING_TEST_MODE,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: PLAN_PRICE, currencyCode: "USD" },
                interval: "EVERY_30_DAYS",
              },
            },
          },
        ],
      },
    }
  );

  const data = await parseShopifyGraphqlResponse(response, "billing approval");
  const result = data.data?.appSubscriptionCreate;

  if (result?.userErrors?.length > 0) {
    throw new Error(`Billing error: ${result.userErrors.map((error: any) => error.message).join(", ")}`);
  }

  if (!result?.confirmationUrl) {
    throw new Error("Billing approval failed: Shopify did not return a confirmation URL.");
  }

  return result.confirmationUrl;
}

export async function checkBillingStatus(
  admin: AdminApiContext
): Promise<{ active: boolean; subscription_id?: string; trial_days_remaining?: number }> {
  const response = await admin.graphql(
    `#graphql
    query {
      appInstallation {
        activeSubscriptions {
          id
          name
          status
          trialDays
          currentPeriodEnd
          lineItems {
            plan {
              pricingDetails {
                ... on AppRecurringPricing {
                  price {
                    amount
                    currencyCode
                  }
                  interval
                }
              }
            }
          }
        }
      }
    }`
  );

  let data: any;
  try {
    data = await parseShopifyGraphqlResponse(response, "billing status");
  } catch (error) {
    console.warn("Billing status check failed:", error);
    return { active: false };
  }

  const subs = data.data?.appInstallation?.activeSubscriptions || [];
  const activeSub = subs.find(
    (subscription: any) => subscription.name === PLAN_NAME && subscription.status === "ACTIVE"
  );

  if (!activeSub) {
    return { active: false };
  }

  const periodEnd = new Date(activeSub.currentPeriodEnd);
  const now = new Date();
  const trialRemaining = activeSub.trialDays
    ? Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / 86400000))
    : 0;

  return {
    active: true,
    subscription_id: activeSub.id,
    trial_days_remaining: trialRemaining,
  };
}

export async function cancelSubscription(
  admin: AdminApiContext,
  subscriptionId: string
): Promise<boolean> {
  const response = await admin.graphql(
    `#graphql
    mutation appSubscriptionCancel($id: ID!) {
      appSubscriptionCancel(id: $id) {
        appSubscription {
          id
          status
        }
        userErrors {
          field
          message
        }
      }
    }`,
    { variables: { id: subscriptionId } }
  );

  const data = await parseShopifyGraphqlResponse(response, "billing cancellation");
  return data.data?.appSubscriptionCancel?.userErrors?.length === 0;
}

async function parseShopifyGraphqlResponse(response: Response, label: string) {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.errors?.[0]?.message || `Shopify returned HTTP ${response.status}`;
    throw new Error(`${label} failed: ${message}`);
  }

  if (data?.errors?.length > 0) {
    throw new Error(`${label} failed: ${data.errors.map((error: any) => error.message).join(", ")}`);
  }

  return data || {};
}

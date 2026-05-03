import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const checks = [
  {
    name: "Shopify scopes include Cart Sniper requirements",
    file: "shopify.app.toml",
    required: ["read_products", "read_orders", "write_discounts"],
  },
  {
    name: "Shopify app config subscribes to revenue webhooks",
    file: "shopify.app.toml",
    required: ["app_subscriptions/update", "carts/update", "orders/create", "products/create", "products/update"],
  },
  {
    name: "Shopify app config includes mandatory privacy webhooks",
    file: "shopify.app.toml",
    required: ["customers/data_request", "customers/redact", "shop/redact", "/webhooks/privacy"],
  },
  {
    name: "Environment example documents launch secrets",
    file: ".env.example",
    required: [
      "SHOPIFY_API_KEY",
      "SHOPIFY_API_SECRET",
      "SCOPES=read_products,read_orders,write_discounts",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "JOB_RUNNER_SECRET",
    ],
  },
  {
    name: "Runtime auth cannot miss required scopes",
    file: "app/shopify.server.ts",
    required: ["read_products", "read_orders", "write_discounts", "getShopifyScopes"],
  },
  {
    name: "Webhook route verifies HMAC before processing",
    file: "app/routes/webhooks.tsx",
    required: ["verifyWebhookHMAC", "Unauthorized", "enqueueAgentJob", "app_subscriptions/update", "unknown_store"],
  },
  {
    name: "Privacy webhook route verifies HMAC",
    file: "app/routes/webhooks.privacy.tsx",
    required: ["verifyWebhookHMAC", "customers/data_request", "customers/redact", "shop/redact"],
  },
  {
    name: "Shopify scopes update webhook handles missing current scopes safely",
    file: "app/routes/webhooks.app.scopes_update.tsx",
    required: ["Array.isArray(payload.current)", "currentScopes.join", "authenticate.webhook"],
  },
  {
    name: "Job runner requires a production secret",
    file: "app/routes/api.jobs.run.tsx",
    required: ["JOB_RUNNER_SECRET", "Unauthorized", "processDueAgentJobs"],
  },
  {
    name: "Storefront intent capture validates and deduplicates input",
    file: "app/routes/api.intent.capture.tsx",
    required: ["normalizeEmail", "normalizeQuery", "intent_capture:${store.id}:${email}:${query.toLowerCase()}"],
  },
  {
    name: "Job queue releases stale processing locks",
    file: "app/services/job-queue.server.ts",
    required: ["STALE_PROCESSING_JOB_MINUTES", "releaseStaleProcessingJobs", "Released stale processing lock for retry."],
  },
];

const failures = [];
const warnings = [];

for (const check of checks) {
  const contents = readFileSync(join(root, check.file), "utf8");
  const missing = check.required.filter((value) => !contents.includes(value));

  if (missing.length > 0) {
    failures.push(`${check.name}: missing ${missing.join(", ")}`);
  } else {
    console.log(`PASS ${check.name}`);
  }
}

if (failures.length > 0) {
  console.error("\nLive readiness smoke failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

const shopifyConfig = readFileSync(join(root, "shopify.app.toml"), "utf8");
if (/(localhost|trycloudflare\.com|lhr\.life|serveousercontent\.com)/.test(shopifyConfig)) {
  warnings.push("Shopify app config still points at a temporary/dev URL. Replace it with stable hosting before public beta.");
}

if (warnings.length > 0) {
  console.warn("\nLive readiness warnings:");
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}

console.log("\nLive readiness smoke passed.");

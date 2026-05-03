import { DEFAULT_OWNER_CONTROLS } from "~/agents/profiles";
import { supabase } from "~/utils/supabase.server";

const DEMO_EMAIL_DOMAIN = "@demo.anotai.local";
const DEMO_FLAG = { demo_seed: true };

const demoProducts = [
  { product_id: "demo-prod-hoodie", variant_id: "demo-var-hoodie", product_title: "Premium Recovery Hoodie", cogs: 28.5, min_price: 34.2 },
  { product_id: "demo-prod-bag", variant_id: "demo-var-bag", product_title: "Founder Leather Weekender", cogs: 84, min_price: 100.8 },
  { product_id: "demo-prod-serum", variant_id: "demo-var-serum", product_title: "Glow Restore Serum", cogs: 11.75, min_price: 14.1 },
  { product_id: "demo-prod-earbuds", variant_id: "demo-var-earbuds", product_title: "Focus Wireless Earbuds", cogs: 36, min_price: 43.2 },
];

const demoCustomers = [
  { email: `ava${DEMO_EMAIL_DOMAIN}`, first_name: "Ava", last_name: "Johnson", shopify_customer_id: "demo-customer-ava" },
  { email: `mason${DEMO_EMAIL_DOMAIN}`, first_name: "Mason", last_name: "Lee", shopify_customer_id: "demo-customer-mason" },
  { email: `sophia${DEMO_EMAIL_DOMAIN}`, first_name: "Sophia", last_name: "Patel", shopify_customer_id: "demo-customer-sophia" },
];

const demoJobIdempotencyKeys = [
  "demo:intent:premium-hoodie",
  "demo:cart-update:pending",
];

export async function seedDemoData(storeId: string) {
  await clearDemoData(storeId);

  await assertNoSupabaseError(
    supabase
      .from("products_cogs")
      .upsert(
        demoProducts.map((product) => ({
          ...product,
          store_id: storeId,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "store_id,variant_id" }
      ),
    "seed product costs"
  );

  const customerIds = await seedCustomers(storeId);
  await seedCustomerSignals(storeId, customerIds);
  await seedCartEvents(storeId);
  await seedEmailEvents(storeId);
  await seedAgentActions(storeId);
  await seedJobs(storeId);

  await assertNoSupabaseError(
    supabase
      .from("stores")
      .update({
        settings: DEFAULT_OWNER_CONTROLS,
        updated_at: new Date().toISOString(),
      })
      .eq("id", storeId),
    "seed owner controls"
  );
}

export async function clearDemoData(storeId: string) {
  const demoCustomerIds = await getDemoCustomerIds(storeId);

  await assertNoSupabaseError(
    supabase.from("email_events").delete().eq("store_id", storeId).like("recipient", `%${DEMO_EMAIL_DOMAIN}`),
    "clear demo email events"
  );
  await assertNoSupabaseError(
    supabase
      .from("agent_jobs")
      .delete()
      .eq("store_id", storeId)
      .in("idempotency_key", demoJobIdempotencyKeys),
    "clear demo jobs"
  );
  await assertNoSupabaseError(
    supabase.from("agent_jobs").delete().eq("store_id", storeId).contains("payload", DEMO_FLAG),
    "clear flagged demo jobs"
  );
  await assertNoSupabaseError(
    supabase.from("agent_actions").delete().eq("store_id", storeId).contains("payload", DEMO_FLAG),
    "clear demo actions"
  );
  await assertNoSupabaseError(
    supabase.from("customer_activities").delete().eq("store_id", storeId).contains("payload", DEMO_FLAG),
    "clear demo activities"
  );
  if (demoCustomerIds.length > 0) {
    await assertNoSupabaseError(
      supabase.from("customer_activities").delete().eq("store_id", storeId).in("customer_id", demoCustomerIds),
      "clear linked demo activities"
    );
  }
  await assertNoSupabaseError(
    supabase.from("customer_intents").delete().eq("store_id", storeId).like("customer_email", `%${DEMO_EMAIL_DOMAIN}`),
    "clear demo intents"
  );
  await assertNoSupabaseError(
    supabase.from("cart_events").delete().eq("store_id", storeId).like("cart_token", "demo-%"),
    "clear demo carts"
  );
  await assertNoSupabaseError(
    supabase.from("products_cogs").delete().eq("store_id", storeId).like("product_id", "demo-%"),
    "clear demo products"
  );
  await assertNoSupabaseError(
    supabase.from("customers").delete().eq("store_id", storeId).like("email", `%${DEMO_EMAIL_DOMAIN}`),
    "clear demo customers"
  );
  await assertNoSupabaseError(
    supabase.from("customers").delete().eq("store_id", storeId).contains("metadata", DEMO_FLAG),
    "clear flagged demo customers"
  );
}

async function getDemoCustomerIds(storeId: string) {
  const { data, error } = await supabase
    .from("customers")
    .select("id")
    .eq("store_id", storeId)
    .like("email", `%${DEMO_EMAIL_DOMAIN}`);

  if (error) {
    throw new Error(`Failed to read demo customers: ${error.message}`);
  }

  return (data || []).map((customer) => customer.id).filter(Boolean);
}

async function seedCustomers(storeId: string) {
  const { error } = await supabase
    .from("customers")
    .upsert(
      demoCustomers.map((customer) => ({
        ...customer,
        store_id: storeId,
        marketing_opt_in: true,
        metadata: { ...DEMO_FLAG, source: "demo_seed" },
        last_seen_at: new Date().toISOString(),
      })),
      { onConflict: "store_id,email" }
    );

  if (error) {
    throw new Error(`Failed to seed customers: ${error.message}`);
  }

  const { data, error: readError } = await supabase
    .from("customers")
    .select("id, email")
    .eq("store_id", storeId)
    .like("email", `%${DEMO_EMAIL_DOMAIN}`);

  if (readError) {
    throw new Error(`Failed to read seeded customers: ${readError.message}`);
  }

  return new Map((data || []).map((customer) => [customer.email, customer.id]));
}

async function seedCustomerSignals(storeId: string, customerIds: Map<string, string>) {
  const now = new Date();
  const rows = [
    {
      email: demoCustomers[0].email,
      query: "premium hoodie",
      activityType: "search_intent",
      payload: { ...DEMO_FLAG, query: "premium hoodie" },
    },
    {
      email: demoCustomers[1].email,
      query: "weekender travel bag",
      activityType: "search_intent",
      payload: { ...DEMO_FLAG, query: "weekender travel bag" },
    },
    {
      email: demoCustomers[2].email,
      query: "skin glow serum",
      activityType: "product_interest",
      payload: { ...DEMO_FLAG, product_title: "Glow Restore Serum" },
    },
  ];

  await assertNoSupabaseError(
    supabase.from("customer_intents").insert(
      rows.slice(0, 2).map((row, index) => ({
        store_id: storeId,
        customer_email: row.email,
        search_query: row.query,
        created_at: new Date(now.getTime() - (index + 1) * 3600000).toISOString(),
      }))
    ),
    "seed customer intents"
  );

  await assertNoSupabaseError(
    supabase.from("customer_activities").insert(
      rows.map((row, index) => ({
        store_id: storeId,
        customer_id: customerIds.get(row.email) || null,
        activity_type: row.activityType,
        payload: row.payload,
        created_at: new Date(now.getTime() - (index + 1) * 2700000).toISOString(),
      }))
    ),
    "seed customer activities"
  );
}

async function seedCartEvents(storeId: string) {
  const now = Date.now();

  await assertNoSupabaseError(
    supabase.from("cart_events").insert([
      {
        store_id: storeId,
        cart_token: "demo-cart-recovered",
        customer_email: demoCustomers[0].email,
        cart_data: [
          { product_id: "demo-prod-hoodie", variant_id: "demo-var-hoodie", title: "Premium Recovery Hoodie", price: 96, quantity: 2 },
        ],
        status: "recovered",
        abandoned_at: new Date(now - 7 * 3600000).toISOString(),
        recovery_sent: true,
        recovery_level: 1,
        discount_code: "ANOTAI-DEMO",
        discount_expires: new Date(now + 3600000).toISOString(),
        recovered_at: new Date(now - 2 * 3600000).toISOString(),
      },
      {
        store_id: storeId,
        cart_token: "demo-cart-pending",
        customer_email: demoCustomers[1].email,
        cart_data: [
          { product_id: "demo-prod-bag", variant_id: "demo-var-bag", title: "Founder Leather Weekender", price: 220, quantity: 1 },
        ],
        status: "abandoned",
        abandoned_at: new Date(now - 45 * 60000).toISOString(),
        recovery_sent: false,
        recovery_level: 0,
      },
    ]),
    "seed cart events"
  );
}

async function seedAgentActions(storeId: string) {
  const now = Date.now();
  const actionRows = [
    {
      agent_name: "margin_guardian",
      action_type: "discount_blocked",
      payload: { ...DEMO_FLAG, requested_discount_pct: 25, max_safe_discount_pct: 8, reason: "Would break margin floor." },
      status: "blocked",
      revenue_impact: 316,
    },
    {
      agent_name: "cart_sniper",
      action_type: "recovery_queued",
      payload: { ...DEMO_FLAG, cart_event_id: "demo-cart-pending", discount_pct: 10, reason: "Owner approval required." },
      status: "pending",
      revenue_impact: 0,
    },
    {
      agent_name: "cart_sniper",
      action_type: "cart_recovered",
      payload: { ...DEMO_FLAG, cart_event_id: "demo-cart-recovered", order_id: "demo-order-1001", discount_code: "ANOTAI-DEMO" },
      status: "executed",
      revenue_impact: 1842,
    },
    {
      agent_name: "personal_shopper",
      action_type: "bundle_impression",
      payload: { ...DEMO_FLAG, bundle_name: "Founder Travel Kit" },
      status: "executed",
      revenue_impact: 0,
    },
    {
      agent_name: "personal_shopper",
      action_type: "bundle_accepted",
      payload: { ...DEMO_FLAG, bundle_name: "Founder Travel Kit" },
      status: "executed",
      revenue_impact: 626,
    },
    {
      agent_name: "retention_engine",
      action_type: "search_captured",
      payload: { ...DEMO_FLAG, email: demoCustomers[1].email, query: "weekender travel bag" },
      status: "executed",
      revenue_impact: 0,
    },
    {
      agent_name: "retention_engine",
      action_type: "vip_drop_queued",
      payload: { ...DEMO_FLAG, product_title: "Founder Leather Weekender", intents_matched: 2, reason: "Approval mode is enabled." },
      status: "pending",
      revenue_impact: 0,
    },
    {
      agent_name: "revenue_analyst",
      action_type: "founder_report_ready",
      payload: { ...DEMO_FLAG, headline: "$2,468 tracked impact from demo agent activity." },
      status: "executed",
      revenue_impact: 0,
    },
  ];

  await assertNoSupabaseError(
    supabase.from("agent_actions").insert(
      actionRows.map((row, index) => ({
        ...row,
        store_id: storeId,
        created_at: new Date(now - index * 18 * 60000).toISOString(),
      }))
    ),
    "seed agent actions"
  );
}

async function seedEmailEvents(storeId: string) {
  const { data: cart } = await supabase
    .from("cart_events")
    .select("id")
    .eq("store_id", storeId)
    .eq("cart_token", "demo-cart-recovered")
    .single();

  if (!cart?.id) {
    return;
  }

  await assertNoSupabaseError(
    supabase.from("email_events").insert({
      store_id: storeId,
      cart_event_id: cart.id,
      email_type: "cart_recovery",
      recipient: demoCustomers[0].email,
      provider_id: "demo-email-1001",
      status: "sent",
      sent_at: new Date(Date.now() - 3 * 3600000).toISOString(),
      payload: { ...DEMO_FLAG, discount_code: "ANOTAI-DEMO", discount_pct: 10 },
    }),
    "seed email events"
  );
}

async function seedJobs(storeId: string) {
  await assertNoSupabaseError(
    supabase
      .from("agent_jobs")
      .delete()
      .eq("store_id", storeId)
      .in("idempotency_key", demoJobIdempotencyKeys),
    "clear demo jobs before reseeding"
  );

  await assertNoSupabaseError(
    supabase.from("agent_jobs").insert([
      {
        store_id: storeId,
        job_type: "intent_capture",
        payload: { ...DEMO_FLAG, email: demoCustomers[0].email, query: "premium hoodie" },
        status: "completed",
        attempts: 1,
        idempotency_key: "demo:intent:premium-hoodie",
        scheduled_at: new Date(Date.now() - 4 * 3600000).toISOString(),
        updated_at: new Date(Date.now() - 4 * 3600000).toISOString(),
      },
      {
        store_id: storeId,
        job_type: "cart_update",
        payload: { ...DEMO_FLAG, cart_token: "demo-cart-pending" },
        status: "pending",
        idempotency_key: "demo:cart-update:pending",
        scheduled_at: new Date().toISOString(),
      },
    ]),
    "seed agent jobs"
  );
}

async function assertNoSupabaseError<T>(
  operation: PromiseLike<{ error: { message: string } | null } & T>,
  label: string
) {
  const { error } = await operation;
  if (error) {
    throw new Error(`Failed to ${label}: ${error.message}`);
  }
}

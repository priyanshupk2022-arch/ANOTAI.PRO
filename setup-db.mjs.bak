/**
 * 🔧 ANOTAI Database Setup Script
 * 
 * Run this once to create all tables in Supabase.
 * Usage: node --loader ts-node/esm setup-db.mjs
 * Or simply: node setup-db.mjs
 */

const SUPABASE_URL = "https://pqigizihhroqzzlylebr.supabase.co";
const SUPABASE_KEY = "sb_secret_Or6mIyhU3vu-xisFbRJuiQ_AX6louKX";

const TABLES = [
  // 1. Stores
  `CREATE TABLE IF NOT EXISTS stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_domain TEXT UNIQUE NOT NULL,
    access_token TEXT NOT NULL,
    plan_status TEXT DEFAULT 'inactive' CHECK (plan_status IN ('active', 'inactive', 'cancelled')),
    billing_id TEXT,
    settings JSONB DEFAULT '{}',
    installed_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  )`,

  // 2. Products COGS
  `CREATE TABLE IF NOT EXISTS products_cogs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    variant_id TEXT NOT NULL,
    product_title TEXT,
    cogs DECIMAL(10,2) NOT NULL,
    min_price DECIMAL(10,2) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(store_id, variant_id)
  )`,

  // 3. Cart Events
  `CREATE TABLE IF NOT EXISTS cart_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    cart_token TEXT NOT NULL,
    customer_email TEXT,
    cart_data JSONB NOT NULL DEFAULT '[]',
    status TEXT DEFAULT 'abandoned' CHECK (status IN ('abandoned', 'sniped', 'recovered', 'expired')),
    abandoned_at TIMESTAMPTZ DEFAULT now(),
    recovery_sent BOOLEAN DEFAULT false,
    recovery_level INT DEFAULT 0,
    discount_code TEXT,
    discount_expires TIMESTAMPTZ,
    recovered_at TIMESTAMPTZ
  )`,

  // 4. Agent Actions
  `CREATE TABLE IF NOT EXISTS agent_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL CHECK (agent_name IN ('margin_guardian', 'personal_shopper', 'cart_sniper', 'retention_engine')),
    action_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'executed', 'blocked')),
    revenue_impact DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,

  // 5. Customer Intents
  `CREATE TABLE IF NOT EXISTS customer_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    customer_email TEXT NOT NULL,
    search_query TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,
];

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_cogs_store ON products_cogs(store_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cart_store_status ON cart_events(store_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_cart_abandoned ON cart_events(abandoned_at)`,
  `CREATE INDEX IF NOT EXISTS idx_actions_store_agent ON agent_actions(store_id, agent_name)`,
  `CREATE INDEX IF NOT EXISTS idx_actions_created ON agent_actions(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_intents_store ON customer_intents(store_id)`,
  `CREATE INDEX IF NOT EXISTS idx_intents_query ON customer_intents(search_query)`,
  `CREATE INDEX IF NOT EXISTS idx_intents_email ON customer_intents(customer_email)`,
  `CREATE INDEX IF NOT EXISTS idx_intents_created ON customer_intents(created_at)`,
];

const RLS = [
  `ALTER TABLE stores ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE products_cogs ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE cart_events ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE agent_actions ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE customer_intents ENABLE ROW LEVEL SECURITY`,
];

async function runSQL(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  return res;
}

async function main() {
  console.log("🚀 ANOTAI Database Setup Starting...\n");

  // Try using PostgREST rpc — if not available, guide user to manual setup
  // First, let's test connection
  const testRes = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
    },
  });

  if (testRes.ok) {
    console.log("✅ Connected to Supabase successfully!\n");
    console.log("⚠️  DDL (CREATE TABLE) statements cannot be run via PostgREST API.");
    console.log("📋 Please run the SQL schema manually:\n");
    console.log("   1. Go to: https://supabase.com/dashboard/project/pqigizihhroqzzlylebr/sql/new");
    console.log("   2. Copy the contents of: anotai/supabase/schema.sql");
    console.log("   3. Paste into the SQL editor and click 'Run'\n");
    console.log("   Or use the Supabase CLI:");
    console.log("   npx supabase db push\n");
  } else {
    console.log("❌ Could not connect to Supabase. Check your URL and keys.");
    console.log(`   Status: ${testRes.status}`);
  }

  // Test if tables already exist by trying to query them
  console.log("🔍 Checking if tables already exist...\n");
  
  const tables = ["stores", "products_cogs", "cart_events", "agent_actions", "customer_intents"];
  
  for (const table of tables) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (res.ok) {
      console.log(`   ✅ ${table} — exists`);
    } else if (res.status === 404) {
      console.log(`   ❌ ${table} — NOT FOUND (needs creation)`);
    } else {
      const text = await res.text();
      console.log(`   ⚠️  ${table} — status ${res.status}: ${text.substring(0, 80)}`);
    }
  }

  console.log("\n🏁 Setup check complete.");
}

main().catch(console.error);

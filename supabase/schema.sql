-- ============================================
-- ANOTAI — Database Schema (V2)
-- 4 Core Microservices: Autonomous Revenue Flywheel
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. STORES — Merchant data, Playbook & subscription
-- settings structure: {
--   "niche": "beauty/skincare",
--   "brand_voice": "professional/friendly",
--   "max_discount": 20,
--   "margin_target": 30,
--   "autonomy_mode": "approval_first",
--   "email_limit": 3,
--   "bestseller_categories": ["serums", "cleansers"]
-- }
CREATE TABLE IF NOT EXISTS stores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_domain   TEXT UNIQUE NOT NULL,
  access_token  TEXT NOT NULL,
  plan_status   TEXT DEFAULT 'inactive' CHECK (plan_status IN ('active', 'inactive', 'cancelled')),
  billing_id    TEXT,
  settings      JSONB DEFAULT '{}',
  installed_at  TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 2. PRODUCTS COGS — Cost of Goods Sold (Margin Guardian)
CREATE TABLE IF NOT EXISTS products_cogs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID REFERENCES stores(id) ON DELETE CASCADE,
  product_id    TEXT NOT NULL,
  variant_id    TEXT NOT NULL,
  product_title TEXT,
  cogs          DECIMAL(10,2) NOT NULL,
  min_price     DECIMAL(10,2) NOT NULL,
  is_in_stock   BOOLEAN DEFAULT true,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(store_id, variant_id)
);

-- 3. CART EVENTS — Abandoned cart tracking (Cart Sniper)
CREATE TABLE IF NOT EXISTS cart_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          UUID REFERENCES stores(id) ON DELETE CASCADE,
  cart_token        TEXT NOT NULL,
  customer_email    TEXT,
  cart_data         JSONB NOT NULL, -- Array of products
  status            TEXT DEFAULT 'abandoned' CHECK (status IN ('abandoned', 'sniped', 'recovered', 'expired')),
  abandoned_at      TIMESTAMPTZ DEFAULT now(),
  recovery_sent     BOOLEAN DEFAULT false,
  recovery_level    INTEGER DEFAULT 0,
  discount_code     TEXT,
  discount_expires  TIMESTAMPTZ,
  recovered_at      TIMESTAMPTZ,
  UNIQUE(store_id, cart_token)
);

-- 4. AGENT ACTIONS — Audit log & performance metrics
CREATE TABLE IF NOT EXISTS agent_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID REFERENCES stores(id) ON DELETE CASCADE,
  agent_name      TEXT NOT NULL,
  action_type     TEXT NOT NULL,
  payload         JSONB DEFAULT '{}',
  status          TEXT DEFAULT 'executed',
  revenue_impact  DECIMAL(10,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 5. CUSTOMER INTENTS — Search intent tracking (Retention Engine)
CREATE TABLE IF NOT EXISTS customer_intents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID REFERENCES stores(id) ON DELETE CASCADE,
  customer_email  TEXT,
  search_query    TEXT NOT NULL,
  intent_score    INTEGER DEFAULT 0,
  products_viewed JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 6. SHOPPER SESSIONS — Conversational Context (Personal Shopper)
CREATE TABLE IF NOT EXISTS shopper_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID REFERENCES stores(id) ON DELETE CASCADE,
  customer_email  TEXT,
  chat_history    JSONB NOT NULL DEFAULT '[]', -- Array of {role: "user"|"assistant", content: "..."}
  skin_profile    JSONB DEFAULT '{}',          -- {skin_type: "...", concerns: [...]}
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(store_id, customer_email)
);

-- ─── Indexes for Performance ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cogs_store ON products_cogs(store_id);
CREATE INDEX IF NOT EXISTS idx_cart_store_status ON cart_events(store_id, status);
CREATE INDEX IF NOT EXISTS idx_cart_abandoned ON cart_events(abandoned_at);
CREATE INDEX IF NOT EXISTS idx_actions_store_agent ON agent_actions(store_id, agent_name);
CREATE INDEX IF NOT EXISTS idx_actions_created ON agent_actions(created_at);
CREATE INDEX IF NOT EXISTS idx_intents_store ON customer_intents(store_id);
CREATE INDEX IF NOT EXISTS idx_intents_query ON customer_intents(search_query);
CREATE INDEX IF NOT EXISTS idx_intents_email ON customer_intents(customer_email);
CREATE INDEX IF NOT EXISTS idx_intents_created ON customer_intents(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_store ON shopper_sessions(store_id);
CREATE INDEX IF NOT EXISTS idx_sessions_email ON shopper_sessions(customer_email);

-- ─── Row Level Security (RLS) ────────────────────────────
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE products_cogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopper_sessions ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS
CREATE POLICY "stores_isolation" ON stores FOR ALL USING (true);
CREATE POLICY "cogs_isolation" ON products_cogs FOR ALL USING (true);
CREATE POLICY "cart_isolation" ON cart_events FOR ALL USING (true);
CREATE POLICY "actions_isolation" ON agent_actions FOR ALL USING (true);
CREATE POLICY "intents_isolation" ON customer_intents FOR ALL USING (true);
CREATE POLICY "sessions_isolation" ON shopper_sessions FOR ALL USING (true);

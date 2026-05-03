-- ============================================
-- ANOTAI — Database Schema (V2)
-- 4 Core Microservices: Autonomous Revenue Flywheel
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. STORES — Merchant data & subscription
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
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(store_id, variant_id)
);

-- 3. CART EVENTS — Abandoned cart tracking (Cart Sniper)
CREATE TABLE IF NOT EXISTS cart_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID REFERENCES stores(id) ON DELETE CASCADE,
  cart_token       TEXT NOT NULL,
  customer_email  TEXT,
  cart_data        JSONB NOT NULL DEFAULT '[]',
  status          TEXT DEFAULT 'abandoned' CHECK (status IN ('abandoned', 'sniped', 'recovered', 'expired')),
  abandoned_at    TIMESTAMPTZ DEFAULT now(),
  recovery_sent   BOOLEAN DEFAULT false,
  recovery_level  INT DEFAULT 0,
  discount_code   TEXT,
  discount_expires TIMESTAMPTZ,
  recovered_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_events_store_token
  ON cart_events(store_id, cart_token);

-- 4. AGENT ACTIONS - Activity log for all ANOTAI agents
CREATE TABLE IF NOT EXISTS agent_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID REFERENCES stores(id) ON DELETE CASCADE,
  agent_name    TEXT NOT NULL CHECK (agent_name IN ('margin_guardian', 'personal_shopper', 'cart_sniper', 'retention_engine', 'revenue_analyst')),
  action_type   TEXT NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}',
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'executed', 'blocked')),
  revenue_impact DECIMAL(10,2) DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 5. AGENT JOBS - Background queue for autoscaling webhook and pixel work
CREATE TABLE IF NOT EXISTS agent_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID REFERENCES stores(id) ON DELETE CASCADE,
  job_type      TEXT NOT NULL CHECK (job_type IN ('cart_update', 'cart_recovery', 'order_create', 'product_create', 'product_update', 'intent_capture')),
  payload       JSONB NOT NULL DEFAULT '{}',
  idempotency_key TEXT,
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts      INT DEFAULT 0,
  max_attempts  INT DEFAULT 3,
  scheduled_at  TIMESTAMPTZ DEFAULT now(),
  locked_at     TIMESTAMPTZ,
  last_error    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID REFERENCES stores(id) ON DELETE CASCADE,
  cart_event_id   UUID REFERENCES cart_events(id) ON DELETE CASCADE,
  email_type      TEXT NOT NULL DEFAULT 'cart_recovery',
  recipient       TEXT NOT NULL,
  provider_id     TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error_message   TEXT,
  payload         JSONB NOT NULL DEFAULT '{}',
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cart_event_id, email_type)
);

-- 6. CUSTOMER INTENTS — Search intent tracking (Retention Engine)
CREATE TABLE IF NOT EXISTS customers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id             UUID REFERENCES stores(id) ON DELETE CASCADE,
  shopify_customer_id  TEXT,
  email                TEXT,
  first_name           TEXT,
  last_name            TEXT,
  marketing_opt_in     BOOLEAN DEFAULT false,
  first_seen_at        TIMESTAMPTZ DEFAULT now(),
  last_seen_at         TIMESTAMPTZ DEFAULT now(),
  metadata             JSONB NOT NULL DEFAULT '{}',
  UNIQUE(store_id, email),
  UNIQUE(store_id, shopify_customer_id)
);

CREATE TABLE IF NOT EXISTS customer_activities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID REFERENCES stores(id) ON DELETE CASCADE,
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('search_intent', 'cart_abandoned', 'cart_recovered', 'order_created', 'product_interest', 'email_sent')),
  payload       JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_intents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID REFERENCES stores(id) ON DELETE CASCADE,
  customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_email  TEXT NOT NULL,
  search_query    TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ─── Indexes for Performance ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cogs_store ON products_cogs(store_id);
CREATE INDEX IF NOT EXISTS idx_cart_store_status ON cart_events(store_id, status);
CREATE INDEX IF NOT EXISTS idx_cart_abandoned ON cart_events(abandoned_at);
CREATE INDEX IF NOT EXISTS idx_actions_store_agent ON agent_actions(store_id, agent_name);
CREATE INDEX IF NOT EXISTS idx_actions_created ON agent_actions(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_due ON agent_jobs(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_store ON agent_jobs(store_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_jobs_idempotency
  ON agent_jobs(store_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_events_store ON email_events(store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_customers_store ON customers(store_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(store_id, email);
CREATE INDEX IF NOT EXISTS idx_customer_activities_store ON customer_activities(store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_customer_activities_customer ON customer_activities(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_intents_store ON customer_intents(store_id);
CREATE INDEX IF NOT EXISTS idx_intents_query ON customer_intents(search_query);
CREATE INDEX IF NOT EXISTS idx_intents_email ON customer_intents(customer_email);
CREATE INDEX IF NOT EXISTS idx_intents_created ON customer_intents(created_at);

-- ─── Row Level Security (RLS) ────────────────────────────
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE products_cogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_intents ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (our server-side code uses service role key)
CREATE POLICY "stores_isolation" ON stores FOR ALL USING (true);
CREATE POLICY "cogs_isolation" ON products_cogs FOR ALL USING (true);
CREATE POLICY "cart_isolation" ON cart_events FOR ALL USING (true);
CREATE POLICY "actions_isolation" ON agent_actions FOR ALL USING (true);
CREATE POLICY "jobs_isolation" ON agent_jobs FOR ALL USING (true);
CREATE POLICY "email_events_isolation" ON email_events FOR ALL USING (true);
CREATE POLICY "customers_isolation" ON customers FOR ALL USING (true);
CREATE POLICY "customer_activities_isolation" ON customer_activities FOR ALL USING (true);
CREATE POLICY "intents_isolation" ON customer_intents FOR ALL USING (true);

-- ANOTAI customer memory tables.
-- These tables are store-scoped. A customer from one merchant is never shared
-- with another merchant.

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

ALTER TABLE customer_intents ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_store ON customers(store_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(store_id, email);
CREATE INDEX IF NOT EXISTS idx_customer_activities_store ON customer_activities(store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_customer_activities_customer ON customer_activities(customer_id, created_at);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_isolation" ON customers;
DROP POLICY IF EXISTS "customer_activities_isolation" ON customer_activities;

CREATE POLICY "customers_isolation" ON customers FOR ALL USING (true);
CREATE POLICY "customer_activities_isolation" ON customer_activities FOR ALL USING (true);

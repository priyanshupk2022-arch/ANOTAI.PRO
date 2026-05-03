CREATE TABLE IF NOT EXISTS agent_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID REFERENCES stores(id) ON DELETE CASCADE,
  job_type        TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  idempotency_key TEXT,
  status          TEXT DEFAULT 'pending',
  attempts        INT DEFAULT 0,
  max_attempts    INT DEFAULT 3,
  scheduled_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at       TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_jobs_idempotency
  ON agent_jobs(store_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_jobs_due
  ON agent_jobs(status, scheduled_at);

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

CREATE TABLE IF NOT EXISTS email_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID REFERENCES stores(id) ON DELETE CASCADE,
  cart_event_id   UUID REFERENCES cart_events(id) ON DELETE SET NULL,
  agent_action_id UUID REFERENCES agent_actions(id) ON DELETE SET NULL,
  email_type      TEXT NOT NULL,
  recipient       TEXT,
  subject         TEXT,
  provider_id     TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  error_message   TEXT,
  payload         JSONB NOT NULL DEFAULT '{}',
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(store_id, cart_event_id, email_type)
);

CREATE INDEX IF NOT EXISTS idx_customers_store ON customers(store_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(store_id, email);
CREATE INDEX IF NOT EXISTS idx_customer_activities_store ON customer_activities(store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_customer_activities_customer ON customer_activities(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_email_events_store ON email_events(store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_email_events_cart ON email_events(cart_event_id);

ALTER TABLE customer_intents
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_intents_customer ON customer_intents(customer_id);

ALTER TABLE agent_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jobs_isolation" ON agent_jobs;
DROP POLICY IF EXISTS "customers_isolation" ON customers;
DROP POLICY IF EXISTS "customer_activities_isolation" ON customer_activities;
DROP POLICY IF EXISTS "email_events_isolation" ON email_events;

CREATE POLICY "jobs_isolation" ON agent_jobs FOR ALL USING (true);
CREATE POLICY "customers_isolation" ON customers FOR ALL USING (true);
CREATE POLICY "customer_activities_isolation" ON customer_activities FOR ALL USING (true);
CREATE POLICY "email_events_isolation" ON email_events FOR ALL USING (true);

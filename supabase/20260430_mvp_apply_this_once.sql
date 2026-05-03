-- ANOTAI MVP one-shot Supabase migration.
-- Run this once in Supabase SQL Editor for an existing ANOTAI project.
-- It is idempotent: safe to run again if a previous run partially succeeded.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

ALTER TABLE agent_actions
  DROP CONSTRAINT IF EXISTS agent_actions_agent_name_check;

ALTER TABLE agent_actions
  ADD CONSTRAINT agent_actions_agent_name_check
  CHECK (
    agent_name IN (
      'margin_guardian',
      'personal_shopper',
      'cart_sniper',
      'retention_engine',
      'revenue_analyst'
    )
  );

ALTER TABLE agent_actions
  DROP CONSTRAINT IF EXISTS agent_actions_status_check;

ALTER TABLE agent_actions
  ADD CONSTRAINT agent_actions_status_check
  CHECK (status IN ('pending', 'approved', 'executed', 'blocked'));

CREATE INDEX IF NOT EXISTS idx_actions_store_status
  ON agent_actions(store_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_events_store_token
  ON cart_events(store_id, cart_token);

CREATE TABLE IF NOT EXISTS agent_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID REFERENCES stores(id) ON DELETE CASCADE,
  job_type        TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  idempotency_key TEXT,
  status          TEXT DEFAULT 'pending',
  attempts        INT DEFAULT 0,
  max_attempts    INT DEFAULT 3,
  scheduled_at    TIMESTAMPTZ DEFAULT now(),
  locked_at       TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE agent_jobs
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE agent_jobs
  DROP CONSTRAINT IF EXISTS agent_jobs_job_type_check;

ALTER TABLE agent_jobs
  ADD CONSTRAINT agent_jobs_job_type_check
  CHECK (job_type IN ('cart_update', 'cart_recovery', 'order_create', 'product_create', 'product_update', 'intent_capture'));

ALTER TABLE agent_jobs
  DROP CONSTRAINT IF EXISTS agent_jobs_status_check;

ALTER TABLE agent_jobs
  ADD CONSTRAINT agent_jobs_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

CREATE INDEX IF NOT EXISTS idx_agent_jobs_due ON agent_jobs(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_store ON agent_jobs(store_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_jobs_idempotency
  ON agent_jobs(store_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

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

ALTER TABLE customer_intents
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_store ON customers(store_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(store_id, email);
CREATE INDEX IF NOT EXISTS idx_customer_activities_store ON customer_activities(store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_customer_activities_customer ON customer_activities(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_intents_store ON customer_intents(store_id);
CREATE INDEX IF NOT EXISTS idx_intents_email ON customer_intents(customer_email);
CREATE INDEX IF NOT EXISTS idx_intents_created ON customer_intents(created_at);

CREATE TABLE IF NOT EXISTS email_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID REFERENCES stores(id) ON DELETE CASCADE,
  cart_event_id   UUID REFERENCES cart_events(id) ON DELETE CASCADE,
  email_type      TEXT NOT NULL DEFAULT 'cart_recovery',
  recipient       TEXT,
  provider_id     TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  error_message   TEXT,
  payload         JSONB NOT NULL DEFAULT '{}',
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cart_event_id, email_type)
);

ALTER TABLE email_events
  ADD COLUMN IF NOT EXISTS recipient TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_events' AND column_name = 'recipient_email'
  ) THEN
    UPDATE email_events
    SET recipient = recipient_email
    WHERE recipient IS NULL AND recipient_email IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_events' AND column_name = 'error'
  ) THEN
    UPDATE email_events
    SET error_message = error
    WHERE error_message IS NULL AND error IS NOT NULL;
  END IF;
END $$;

ALTER TABLE email_events
  DROP CONSTRAINT IF EXISTS email_events_status_check;

ALTER TABLE email_events
  ADD CONSTRAINT email_events_status_check
  CHECK (status IN ('pending', 'sent', 'failed', 'skipped'));

CREATE INDEX IF NOT EXISTS idx_email_events_store ON email_events(store_id, created_at);

ALTER TABLE agent_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jobs_isolation" ON agent_jobs;
DROP POLICY IF EXISTS "customers_isolation" ON customers;
DROP POLICY IF EXISTS "customer_activities_isolation" ON customer_activities;
DROP POLICY IF EXISTS "intents_isolation" ON customer_intents;
DROP POLICY IF EXISTS "email_events_isolation" ON email_events;

CREATE POLICY "jobs_isolation" ON agent_jobs FOR ALL USING (true);
CREATE POLICY "customers_isolation" ON customers FOR ALL USING (true);
CREATE POLICY "customer_activities_isolation" ON customer_activities FOR ALL USING (true);
CREATE POLICY "intents_isolation" ON customer_intents FOR ALL USING (true);
CREATE POLICY "email_events_isolation" ON email_events FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';


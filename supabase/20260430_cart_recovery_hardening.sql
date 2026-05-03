-- Cart Sniper MVP hardening: DB scheduling, idempotency, and email dedupe.

CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_events_store_token
  ON cart_events(store_id, cart_token);

ALTER TABLE agent_jobs
  DROP CONSTRAINT IF EXISTS agent_jobs_job_type_check;

ALTER TABLE agent_jobs
  ADD CONSTRAINT agent_jobs_job_type_check
  CHECK (job_type IN ('cart_update', 'cart_recovery', 'order_create', 'product_create', 'product_update', 'intent_capture'));

ALTER TABLE agent_jobs
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_jobs_idempotency
  ON agent_jobs(store_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS email_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID REFERENCES stores(id) ON DELETE CASCADE,
  cart_event_id   UUID REFERENCES cart_events(id) ON DELETE CASCADE,
  email_type      TEXT NOT NULL DEFAULT 'cart_recovery',
  recipient       TEXT,
  provider_id     TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
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
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'email_events'
      AND column_name = 'recipient_email'
  ) THEN
    UPDATE email_events
    SET recipient = recipient_email
    WHERE recipient IS NULL
      AND recipient_email IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'email_events'
      AND column_name = 'error'
  ) THEN
    UPDATE email_events
    SET error_message = error
    WHERE error_message IS NULL
      AND error IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_events_store ON email_events(store_id, created_at);

ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_events_isolation" ON email_events;
CREATE POLICY "email_events_isolation" ON email_events FOR ALL USING (true);

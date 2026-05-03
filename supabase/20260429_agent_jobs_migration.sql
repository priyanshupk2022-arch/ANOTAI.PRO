-- ANOTAI background job queue for autoscaling webhook and storefront events.

CREATE TABLE IF NOT EXISTS agent_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID REFERENCES stores(id) ON DELETE CASCADE,
  job_type      TEXT NOT NULL CHECK (job_type IN ('cart_update', 'order_create', 'product_create', 'product_update', 'intent_capture')),
  payload       JSONB NOT NULL DEFAULT '{}',
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts      INT DEFAULT 0,
  max_attempts  INT DEFAULT 3,
  scheduled_at  TIMESTAMPTZ DEFAULT now(),
  locked_at     TIMESTAMPTZ,
  last_error    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_jobs_due ON agent_jobs(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_store ON agent_jobs(store_id);

ALTER TABLE agent_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jobs_isolation" ON agent_jobs;
CREATE POLICY "jobs_isolation" ON agent_jobs FOR ALL USING (true);

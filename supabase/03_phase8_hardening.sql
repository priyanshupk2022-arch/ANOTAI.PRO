-- =====================================================
-- PHASE 8: LAUNCH HARDENING MIGRATION (ADDITIVE ONLY)
-- Run this AFTER all previous migrations.
-- =====================================================

-- 1. STORE-LEVEL SAFETY CONTROLS
-- Add columns to merchant_agent_settings if they don't exist.
-- These gates control what the AI is allowed to do per store.

ALTER TABLE merchant_agent_settings
  ADD COLUMN IF NOT EXISTS automation_enabled            BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS recovery_emails_enabled       BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS war_room_enabled              BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS customer_ai_replies_enabled   BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS auto_discount_replies_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS max_daily_ai_interactions     INTEGER DEFAULT 500,
  ADD COLUMN IF NOT EXISTS max_daily_recovery_emails     INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS max_daily_auto_executions     INTEGER DEFAULT 20;

-- Comment describing the safety columns
COMMENT ON COLUMN merchant_agent_settings.automation_enabled           IS 'Master kill switch for all AI automation for this store';
COMMENT ON COLUMN merchant_agent_settings.recovery_emails_enabled      IS 'Allow sending cart recovery emails for this store';
COMMENT ON COLUMN merchant_agent_settings.war_room_enabled             IS 'Allow War Room hierarchical workflows for this store';
COMMENT ON COLUMN merchant_agent_settings.customer_ai_replies_enabled  IS 'Allow AI-generated customer-facing replies for this store';
COMMENT ON COLUMN merchant_agent_settings.auto_discount_replies_enabled IS 'Allow auto-sending of approved margin-safe discount replies';


-- 2. ERROR LOGGING TABLE
-- Central error log for all failed operations across the system.

CREATE TABLE IF NOT EXISTS error_logs (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id      UUID        REFERENCES stores(id) ON DELETE SET NULL,
  source        TEXT        NOT NULL,  -- 'ai_call' | 'email' | 'webhook' | 'action_execution' | 'margin_guardian' | 'supabase_write'
  event_type    TEXT        NOT NULL,  -- e.g. 'send_recovery_email', 'cart_abandoned_webhook'
  severity      TEXT        NOT NULL DEFAULT 'error',  -- 'warning' | 'error' | 'critical'
  error_message TEXT        NOT NULL,
  metadata      JSONB       DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

-- Index for fast dashboard queries
CREATE INDEX IF NOT EXISTS idx_error_logs_store_id   ON error_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity   ON error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC);

-- RLS: Store-scoped access only
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY error_logs_store_isolation ON error_logs
  USING (store_id = current_setting('app.store_id', TRUE)::UUID OR store_id IS NULL);


-- 3. WEBHOOK IDEMPOTENCY TABLE
-- Track processed webhook IDs to prevent duplicate action creation.

CREATE TABLE IF NOT EXISTS processed_webhooks (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  shopify_event_id TEXT        NOT NULL UNIQUE,
  store_id         UUID        REFERENCES stores(id) ON DELETE CASCADE,
  topic            TEXT        NOT NULL,
  processed_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processed_webhooks_event_id ON processed_webhooks(shopify_event_id);
CREATE INDEX IF NOT EXISTS idx_processed_webhooks_store_id ON processed_webhooks(store_id);

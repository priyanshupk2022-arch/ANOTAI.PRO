-- ANOTAI owner controls and 5-agent support.
-- Run this once in the Supabase SQL editor for existing projects.

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

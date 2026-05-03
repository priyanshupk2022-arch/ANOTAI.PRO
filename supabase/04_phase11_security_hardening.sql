-- =====================================================
-- PHASE 11: SECURITY & RLS HARDENING
-- Remove broad open policies and enforce store isolation.
-- =====================================================

-- 1. DROP UNSAFE OPEN POLICIES
DROP POLICY IF EXISTS "stores_isolation" ON stores;
DROP POLICY IF EXISTS "cogs_isolation" ON products_cogs;
DROP POLICY IF EXISTS "cart_isolation" ON cart_events;
DROP POLICY IF EXISTS "actions_isolation" ON agent_actions;
DROP POLICY IF EXISTS "jobs_isolation" ON agent_jobs;
DROP POLICY IF EXISTS "email_events_isolation" ON email_events;
DROP POLICY IF EXISTS "customers_isolation" ON customers;
DROP POLICY IF EXISTS "customer_activities_isolation" ON customer_activities;
DROP POLICY IF EXISTS "intents_isolation" ON customer_intents;
DROP POLICY IF EXISTS "sessions_isolation" ON shopper_sessions;

-- 2. ENFORCE STORE ISOLATION VIA RLS
-- Note: Service role (used by server-side) bypasses these.
-- These policies protect against direct anon/authenticated access via client SDK.

-- STORES (Admin only, no public access)
CREATE POLICY "stores_admin_only" ON stores
  FOR SELECT USING (false);

-- PRODUCTS COGS
CREATE POLICY "cogs_store_isolation" ON products_cogs
  FOR ALL USING (store_id::text = current_setting('app.store_id', TRUE));

-- CART EVENTS
CREATE POLICY "cart_store_isolation" ON cart_events
  FOR ALL USING (store_id::text = current_setting('app.store_id', TRUE));

-- AGENT ACTIONS
CREATE POLICY "actions_store_isolation" ON agent_actions
  FOR ALL USING (store_id::text = current_setting('app.store_id', TRUE));

-- AGENT JOBS
CREATE POLICY "jobs_store_isolation" ON agent_jobs
  FOR ALL USING (store_id::text = current_setting('app.store_id', TRUE));

-- EMAIL EVENTS
CREATE POLICY "email_store_isolation" ON email_events
  FOR ALL USING (store_id::text = current_setting('app.store_id', TRUE));

-- CUSTOMERS
CREATE POLICY "customers_store_isolation" ON customers
  FOR ALL USING (store_id::text = current_setting('app.store_id', TRUE));

-- CUSTOMER ACTIVITIES
CREATE POLICY "activities_store_isolation" ON customer_activities
  FOR ALL USING (store_id::text = current_setting('app.store_id', TRUE));

-- CUSTOMER INTENTS
CREATE POLICY "intents_store_isolation" ON customer_intents
  FOR ALL USING (store_id::text = current_setting('app.store_id', TRUE));

-- SHOPPER SESSIONS
CREATE POLICY "sessions_store_isolation" ON shopper_sessions
  FOR ALL USING (store_id::text = current_setting('app.store_id', TRUE));

-- MERCHANT AGENT SETTINGS
ALTER TABLE merchant_agent_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "merchant_settings_isolation" ON merchant_agent_settings;
CREATE POLICY "merchant_settings_store_isolation" ON merchant_agent_settings
  FOR ALL USING (store_id::text = current_setting('app.store_id', TRUE));

-- PROCESSED WEBHOOKS
ALTER TABLE processed_webhooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "webhooks_store_isolation" ON processed_webhooks;
CREATE POLICY "webhooks_store_isolation" ON processed_webhooks
  FOR ALL USING (store_id::text = current_setting('app.store_id', TRUE));

-- AGENT TASKS
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasks_store_isolation" ON agent_tasks;
CREATE POLICY "tasks_store_isolation" ON agent_tasks
  FOR ALL USING (store_id::text = current_setting('app.store_id', TRUE));

-- AGENT WORKFLOWS
ALTER TABLE agent_workflows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workflows_store_isolation" ON agent_workflows;
CREATE POLICY "workflows_store_isolation" ON agent_workflows
  FOR ALL USING (store_id::text = current_setting('app.store_id', TRUE));

-- 3. PUBLIC READ-ONLY TABLES (None identified as safe for public/anon)
-- All data is merchant-scoped.

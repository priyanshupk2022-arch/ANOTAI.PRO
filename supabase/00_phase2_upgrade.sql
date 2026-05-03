-- ============================================
-- ANOTAI — Phase 2 Upgrade: Agent Architecture
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. PLAN CONFIGS
CREATE TABLE IF NOT EXISTS plan_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key TEXT UNIQUE NOT NULL,
  plan_name TEXT NOT NULL,
  price_monthly DECIMAL(10,2) NOT NULL,
  setup_fee DECIMAL(10,2) DEFAULT 0,
  active_agent_limit INT NOT NULL,
  ai_interaction_limit INT NOT NULL,
  recovery_email_limit INT NOT NULL,
  war_room_limit INT NOT NULL,
  smart_mode_enabled BOOLEAN DEFAULT false,
  war_room_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. AGENTS REGISTRY
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  role_description TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'beta')),
  plan_availability TEXT[] DEFAULT '{"pilot", "growth", "scale", "elite"}',
  permission_level TEXT DEFAULT 'suggest_only' CHECK (permission_level IN ('suggest_only', 'draft_action', 'auto_execute')),
  tools_allowed TEXT[] DEFAULT '{}',
  model_config JSONB DEFAULT '{"temperature": 0.7, "model": "gemini-1.5-flash"}',
  max_tokens INT DEFAULT 1024,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. MERCHANT AGENT SETTINGS
CREATE TABLE IF NOT EXISTS merchant_agent_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  plan_key TEXT REFERENCES plan_configs(plan_key),
  ai_spend_mode TEXT DEFAULT 'balanced' CHECK (ai_spend_mode IN ('conservative', 'balanced', 'aggressive')),
  max_discount_percentage INT DEFAULT 20,
  minimum_profit_margin INT DEFAULT 30,
  require_approval_above_discount INT DEFAULT 15,
  require_approval_for_refunds BOOLEAN DEFAULT true,
  require_approval_for_price_changes BOOLEAN DEFAULT true,
  require_approval_for_bulk_emails BOOLEAN DEFAULT true,
  enabled_agents TEXT[] DEFAULT '{}',
  brand_voice TEXT,
  safety_rules TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(store_id)
);

-- 4. AGENT THREADS
CREATE TABLE IF NOT EXISTS agent_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  workflow_type TEXT NOT NULL,
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'resolved', 'failed')),
  final_decision TEXT,
  risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. AGENT MESSAGES
CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES agent_threads(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  message_type TEXT NOT NULL,
  observation TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  confidence_score INT CHECK (confidence_score BETWEEN 0 AND 100),
  risk_score INT CHECK (risk_score BETWEEN 0 AND 100),
  requested_action JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. AGENT DECISIONS
CREATE TABLE IF NOT EXISTS agent_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES agent_threads(id) ON DELETE CASCADE,
  orchestrator_decision TEXT NOT NULL,
  selected_action JSONB,
  rejected_actions JSONB DEFAULT '[]',
  approval_required BOOLEAN DEFAULT false,
  reason_summary TEXT NOT NULL,
  expected_revenue_impact DECIMAL(10,2) DEFAULT 0,
  expected_margin_impact DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. ACTION QUEUE
CREATE TABLE IF NOT EXISTS action_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  event_id TEXT,
  workflow_id UUID REFERENCES agent_threads(id) ON DELETE SET NULL,
  proposed_by_agent TEXT NOT NULL,
  approved_by TEXT,
  action_type TEXT NOT NULL,
  action_payload JSONB DEFAULT '{}',
  risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  requires_approval BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed', 'expired')),
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ
);

-- 8. AI USAGE EVENTS
CREATE TABLE IF NOT EXISTS ai_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  event_id TEXT,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  workflow_id UUID REFERENCES agent_threads(id) ON DELETE SET NULL,
  model_used TEXT NOT NULL,
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  estimated_cost DECIMAL(10,6) DEFAULT 0,
  plan TEXT,
  mode TEXT CHECK (mode IN ('fast', 'smart', 'war_room')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. MONTHLY USAGE COUNTERS
CREATE TABLE IF NOT EXISTS monthly_usage_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  billing_month TEXT NOT NULL, -- e.g., '2023-10'
  ai_interactions_used INT DEFAULT 0,
  recovery_emails_sent INT DEFAULT 0,
  war_room_decisions_used INT DEFAULT 0,
  estimated_ai_cost DECIMAL(10,4) DEFAULT 0,
  plan_limit_interactions INT DEFAULT 0,
  plan_limit_emails INT DEFAULT 0,
  plan_limit_war_room INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(store_id, billing_month)
);

-- 10. AGENT INVOCATIONS
CREATE TABLE IF NOT EXISTS agent_invocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'failed', 'timeout')),
  latency_ms INT,
  input_summary TEXT,
  output_summary TEXT,
  confidence_score INT,
  risk_score INT,
  estimated_cost DECIMAL(10,6) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================
-- RLS POLICIES FOR NEW TABLES
-- ============================================

ALTER TABLE plan_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_invocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_plans" ON plan_configs FOR SELECT USING (true);
CREATE POLICY "public_agents" ON agents FOR SELECT USING (true);
CREATE POLICY "settings_isolation" ON merchant_agent_settings FOR ALL USING (true);
CREATE POLICY "threads_isolation" ON agent_threads FOR ALL USING (true);
CREATE POLICY "messages_isolation" ON agent_messages FOR ALL USING (true);
CREATE POLICY "decisions_isolation" ON agent_decisions FOR ALL USING (true);
CREATE POLICY "queue_isolation" ON action_queue FOR ALL USING (true);
CREATE POLICY "usage_events_isolation" ON ai_usage_events FOR ALL USING (true);
CREATE POLICY "usage_counters_isolation" ON monthly_usage_counters FOR ALL USING (true);
CREATE POLICY "invocations_isolation" ON agent_invocations FOR ALL USING (true);


-- ============================================
-- SEED DATA: PLAN CONFIGS
-- ============================================

INSERT INTO plan_configs (plan_key, plan_name, price_monthly, setup_fee, active_agent_limit, ai_interaction_limit, recovery_email_limit, war_room_limit, smart_mode_enabled, war_room_enabled)
VALUES 
  ('pilot', 'Founding Brand Pilot', 0.00, 0.00, 4, 1000, 100, 0, false, false),
  ('growth', 'Growth', 999.00, 1500.00, 6, 5000, 500, 0, true, false),
  ('scale', 'Scale', 1999.00, 3000.00, 12, 20000, 2000, 50, true, true),
  ('elite', 'Elite', 2599.00, 5000.00, 24, 50000, 5000, 500, true, true)
ON CONFLICT (plan_key) DO NOTHING;


-- ============================================
-- SEED DATA: 24 AGENTS REGISTRY
-- ============================================

INSERT INTO agents (key, name, department, role_description, permission_level)
VALUES 
  -- REVENUE DEPARTMENT
  ('sales_agent', 'Sales Agent', 'Revenue', 'Finds revenue growth opportunities, upsells, cross-sells, and AOV improvement ideas.', 'suggest_only'),
  ('marketing_agent', 'Marketing Agent', 'Revenue', 'Creates campaign ideas, funnel suggestions, and promotion strategies.', 'suggest_only'),
  ('media_buyer', 'Media Buyer Agent', 'Revenue', 'Suggests ad tests, campaign improvements, and audience ideas. Must NOT auto-change ad budgets.', 'suggest_only'),
  ('product_research', 'Product Research Agent', 'Revenue', 'Finds trending beauty/skincare products, competitor opportunities, and product gaps.', 'suggest_only'),
  ('copy_agent', 'Copy Agent', 'Revenue', 'Writes product copy, ad copy, landing page copy, cart emails, and skincare benefit messaging.', 'draft_action'),
  ('email_agent', 'Email Agent', 'Revenue', 'Builds and sends recovery, retention, upsell, and winback emails through Resend.', 'auto_execute'),
  ('cro_agent', 'CRO Agent', 'Revenue', 'Suggests conversion improvements for product pages, carts, and funnels.', 'suggest_only'),
  ('cart_agent', 'Cart Agent', 'Revenue', 'Handles abandoned cart recovery, cart upsells, bundle offers, and checkout rescue logic.', 'draft_action'),

  -- CREATIVE DEPARTMENT
  ('video_agent', 'Video Agent', 'Creative', 'Generates video hooks, UGC scripts, short-form ad concepts, and creative briefs.', 'suggest_only'),
  ('graphic_agent', 'Graphic Agent', 'Creative', 'Suggests banners, product visuals, offer creatives, and ad image concepts.', 'suggest_only'),
  ('ui_ux_agent', 'UI/UX Agent', 'Creative', 'Suggests layout improvements, trust badges, product page structure, and navigation changes.', 'suggest_only'),
  ('seo_agent', 'SEO Agent', 'Creative', 'Suggests keywords, meta titles, meta descriptions, blog topics, and organic growth ideas.', 'draft_action'),

  -- OPERATIONS DEPARTMENT
  ('inventory_agent', 'Inventory Agent', 'Operations', 'Tracks stock, low-stock items, out-of-stock replacement recommendations, and SKU warnings.', 'suggest_only'),
  ('fulfillment_agent', 'Fulfillment Agent', 'Operations', 'Handles order tracking, shipping updates, and delivery-related customer responses.', 'auto_execute'),
  ('support_agent', 'Support Agent', 'Operations', 'Handles customer questions, FAQs, product help, refunds, complaints, and support escalation.', 'draft_action'),
  ('qa_agent', 'QA Agent', 'Operations', 'Detects broken links, checkout issues, missing products, widget errors, and theme problems.', 'suggest_only'),

  -- FINANCE & CONTROL DEPARTMENT
  ('finance_agent', 'Finance Agent', 'Finance & Control', 'Tracks revenue, ad spend, cost, profit, cash flow, and profitability summaries.', 'suggest_only'),
  ('margin_guardian', 'Margin Guardian', 'Finance & Control', 'Checks COGS, margin, discount safety, bundle profitability, and blocks loss-making actions.', 'auto_execute'),
  ('analytics_agent', 'Analytics Agent', 'Finance & Control', 'Reads metrics, detects trends, reports ROAS, AOV, conversion, cart recovery, and revenue impact.', 'suggest_only'),
  ('project_manager', 'Project Manager Agent', 'Finance & Control', 'Converts decisions into tasks, tracks status, and manages execution queue.', 'suggest_only'),
  ('developer_agent', 'Developer Agent', 'Finance & Control', 'Suggests Shopify technical fixes, Liquid changes, app logic improvements, and debugging steps.', 'suggest_only'),
  ('frontend_agent', 'Frontend Agent', 'Finance & Control', 'Suggests frontend UI fixes, JavaScript widget issues, and customer-facing interaction improvements.', 'suggest_only'),
  ('app_manager', 'App Manager Agent', 'Finance & Control', 'Manages app integrations, automation settings, webhooks, and tool connections.', 'suggest_only'),
  ('strategy_agent', 'Strategy Agent', 'Finance & Control', 'Helps the merchant with high-level growth strategy, positioning, and revenue priorities.', 'suggest_only')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- ANOTAI — Phase 3 Hierarchy Seed
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. UPSERT ALL AGENTS WITH BASIC DETAILS AND LEVELS
-- We use INSERT ... ON CONFLICT (key) DO UPDATE to preserve existing IDs and data

INSERT INTO agents (key, name, department, role_description, agent_level, can_delegate, can_approve, escalation_threshold)
VALUES
  -- LEVEL 0: ROUTER
  ('intent_router', 'Intent Router', 'System', 'Classifies events and routes them to the correct department.', 'router', true, false, '{}'::jsonb),

  -- LEVEL 1: CEO
  ('strategy_agent', 'Strategy Agent', 'Executive', 'Helps the merchant with high-level growth strategy, positioning, and revenue priorities. Final approver for War Room.', 'ceo', true, true, '{}'::jsonb),

  -- LEVEL 2: MANAGERS
  ('sales_agent', 'Revenue Manager', 'Revenue', 'Oversees all revenue growth opportunities, upsells, cross-sells, and AOV improvement ideas.', 'manager', true, true, '{"cart_value_gt": 250, "customer_ltv_gt": 500, "discount_requested_gt": 15, "margin_risk": ["medium", "high"], "requires_ceo_for": ["price_change", "ad_budget_change", "storewide_discount"]}'::jsonb),
  ('copy_agent', 'Creative Manager', 'Creative', 'Oversees product copy, ad copy, landing page copy, and visual design efforts.', 'manager', true, false, '{"requires_ceo_for": ["homepage_change", "brand_positioning_change", "major_campaign"], "bulk_content_change": true}'::jsonb),
  ('inventory_agent', 'Operations Manager', 'Operations', 'Oversees fulfillment, stock, out-of-stock replacements, and overall customer support ops.', 'manager', true, true, '{"refund_amount_gt": 100, "complaint_severity": ["high"], "requires_ceo_for": ["policy_exception", "large_refund"]}'::jsonb),
  ('margin_guardian', 'Finance Manager', 'Finance & Control', 'Checks COGS, margin, discount safety, and blocks loss-making actions. Finance leader.', 'manager', true, true, '{"minimum_margin_required": true, "requires_ceo_for": ["negative_margin", "large_discount", "refund_over_threshold"]}'::jsonb),

  -- LEVEL 3: REVENUE SPECIALISTS
  ('personal_shopper', 'Personal Shopper', 'Revenue', 'Increases AOV with guided bundles and targeted product recommendations.', 'specialist', false, false, '{}'::jsonb),
  ('cart_agent', 'Cart Sniper', 'Revenue', 'Handles abandoned cart recovery, cart upsells, and checkout rescue logic.', 'specialist', false, false, '{}'::jsonb),
  ('cro_agent', 'CRO Agent', 'Revenue', 'Suggests conversion improvements for product pages, carts, and funnels.', 'specialist', false, false, '{}'::jsonb),
  ('email_agent', 'Retention Engine', 'Revenue', 'Builds and sends recovery, retention, upsell, and winback emails.', 'specialist', false, false, '{}'::jsonb),
  ('product_research', 'Product Research Agent', 'Revenue', 'Finds trending beauty/skincare products, competitor opportunities, and product gaps.', 'specialist', false, false, '{}'::jsonb),
  ('marketing_agent', 'Marketing Agent', 'Revenue', 'Creates campaign ideas, funnel suggestions, and promotion strategies.', 'specialist', false, false, '{}'::jsonb),
  ('media_buyer', 'Media Buyer Agent', 'Revenue', 'Suggests ad tests, campaign improvements, and audience ideas.', 'specialist', false, false, '{}'::jsonb),

  -- LEVEL 3: CREATIVE SPECIALISTS
  ('video_agent', 'Video Agent', 'Creative', 'Generates video hooks, UGC scripts, short-form ad concepts, and creative briefs.', 'specialist', false, false, '{}'::jsonb),
  ('graphic_agent', 'Graphic Agent', 'Creative', 'Suggests banners, product visuals, offer creatives, and ad image concepts.', 'specialist', false, false, '{}'::jsonb),
  ('ui_ux_agent', 'UI/UX Agent', 'Creative', 'Suggests layout improvements, trust badges, product page structure, and navigation changes.', 'specialist', false, false, '{}'::jsonb),
  ('seo_agent', 'SEO Agent', 'Creative', 'Suggests keywords, meta titles, meta descriptions, blog topics, and organic growth ideas.', 'specialist', false, false, '{}'::jsonb),

  -- LEVEL 3: OPERATIONS SPECIALISTS
  ('support_agent', 'Support Agent', 'Operations', 'Handles customer questions, FAQs, product help, refunds, complaints, and support escalation.', 'specialist', false, false, '{}'::jsonb),
  ('fulfillment_agent', 'Fulfillment Agent', 'Operations', 'Handles order tracking, shipping updates, and delivery-related customer responses.', 'specialist', false, false, '{}'::jsonb),
  ('qa_agent', 'QA Agent', 'Operations', 'Detects broken links, checkout issues, missing products, widget errors, and theme problems.', 'specialist', false, false, '{}'::jsonb),
  ('inventory_specialist', 'Inventory Specialist', 'Operations', 'Monitors stock levels and provides replenishment alerts.', 'specialist', false, false, '{}'::jsonb),

  -- LEVEL 3: FINANCE SPECIALISTS
  ('finance_agent', 'Finance Agent', 'Finance & Control', 'Tracks revenue, ad spend, cost, profit, cash flow, and profitability summaries.', 'specialist', false, false, '{}'::jsonb),
  ('analytics_agent', 'Analytics Agent', 'Finance & Control', 'Reads metrics, detects trends, reports ROAS, AOV, conversion, cart recovery, and revenue impact.', 'specialist', false, false, '{}'::jsonb)

ON CONFLICT (key) DO UPDATE SET
  agent_level = EXCLUDED.agent_level,
  department = EXCLUDED.department,
  can_delegate = EXCLUDED.can_delegate,
  can_approve = EXCLUDED.can_approve,
  escalation_threshold = EXCLUDED.escalation_threshold;

-- 2. DYNAMICALLY WIRE THE HIERARCHY (PARENT IDs)
DO $$
DECLARE
  v_ceo_id UUID;
  v_rev_mgr_id UUID;
  v_cre_mgr_id UUID;
  v_ops_mgr_id UUID;
  v_fin_mgr_id UUID;
BEGIN
  -- Get IDs of CEO and Managers
  SELECT id INTO v_ceo_id FROM agents WHERE key = 'strategy_agent';
  SELECT id INTO v_rev_mgr_id FROM agents WHERE key = 'sales_agent';
  SELECT id INTO v_cre_mgr_id FROM agents WHERE key = 'copy_agent';
  SELECT id INTO v_ops_mgr_id FROM agents WHERE key = 'inventory_agent';
  SELECT id INTO v_fin_mgr_id FROM agents WHERE key = 'margin_guardian';

  -- Set Managers' parent to CEO
  UPDATE agents SET parent_id = v_ceo_id WHERE key IN ('sales_agent', 'copy_agent', 'inventory_agent', 'margin_guardian');

  -- Set Revenue Specialists' parent to Revenue Manager
  UPDATE agents SET parent_id = v_rev_mgr_id WHERE key IN ('personal_shopper', 'cart_agent', 'cro_agent', 'email_agent', 'product_research', 'marketing_agent', 'media_buyer');

  -- Set Creative Specialists' parent to Creative Manager
  UPDATE agents SET parent_id = v_cre_mgr_id WHERE key IN ('video_agent', 'graphic_agent', 'ui_ux_agent', 'seo_agent');

  -- Set Operations Specialists' parent to Operations Manager
  UPDATE agents SET parent_id = v_ops_mgr_id WHERE key IN ('support_agent', 'fulfillment_agent', 'qa_agent', 'inventory_specialist');

  -- Set Finance Specialists' parent to Finance Manager
  UPDATE agents SET parent_id = v_fin_mgr_id WHERE key IN ('finance_agent', 'analytics_agent');

END $$;

-- 3. VALIDATION QUERY VIEWS (You can run these manually to verify)
-- View CEO and Managers
-- SELECT name, key, agent_level, department FROM agents WHERE agent_level IN ('ceo', 'manager') ORDER BY agent_level;

-- View Orphan Agents (Should be zero, except Intent Router and CEO)
-- SELECT name, key, agent_level FROM agents WHERE parent_id IS NULL AND agent_level NOT IN ('router', 'ceo');

-- Check for Duplicate Keys
-- SELECT key, COUNT(*) FROM agents GROUP BY key HAVING COUNT(*) > 1;

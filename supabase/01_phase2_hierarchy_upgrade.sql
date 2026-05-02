-- ============================================
-- ANOTAI — Phase 2 Hierarchy Upgrade
-- ============================================

-- 1. UPDATE AGENTS TABLE (Additive only)
-- Note: 'department' already exists from the previous migration, so we skip adding it.
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS agent_level TEXT CHECK (agent_level IN ('router', 'ceo', 'manager', 'specialist')),
ADD COLUMN IF NOT EXISTS escalation_threshold JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS can_delegate BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_approve BOOLEAN DEFAULT false;

-- 2. CREATE AGENT_WORKFLOWS TABLE
-- Note: Using UUID for store_id to maintain referential integrity with the existing 'stores' table.
CREATE TABLE IF NOT EXISTS agent_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  event_id TEXT,
  workflow_type TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('fast', 'smart', 'war_room')),
  root_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  current_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. CREATE AGENT_TASKS TABLE
-- Note: Using UUID for store_id to maintain referential integrity.
CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES agent_workflows(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES agent_threads(id) ON DELETE CASCADE,
  assigned_by_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  assigned_to_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL,
  task_payload JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  result_summary TEXT,
  confidence_score NUMERIC CHECK (confidence_score BETWEEN 0 AND 100),
  risk_score NUMERIC CHECK (risk_score BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 4. ADD INDEXES
CREATE INDEX IF NOT EXISTS idx_agents_parent_id ON agents(parent_id);
CREATE INDEX IF NOT EXISTS idx_agents_level ON agents(agent_level);
CREATE INDEX IF NOT EXISTS idx_agents_dept ON agents(department);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_store ON agent_tasks(store_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_workflow ON agent_tasks(workflow_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_thread ON agent_tasks(thread_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_assigned_to ON agent_tasks(assigned_to_agent_id);

CREATE INDEX IF NOT EXISTS idx_agent_workflows_store ON agent_workflows(store_id);
CREATE INDEX IF NOT EXISTS idx_agent_workflows_status ON agent_workflows(status);

-- 5. RLS POLICIES (Preserving security)
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workflows ENABLE ROW LEVEL SECURITY;

-- Note: In this architecture, the service role bypasses RLS for background tasks.
-- These mirror the existing isolation policies.
CREATE POLICY "tasks_isolation" ON agent_tasks FOR ALL USING (true);
CREATE POLICY "workflows_isolation" ON agent_workflows FOR ALL USING (true);

import { supabase } from "~/utils/supabase.server";

export async function getAvailableAgents(storeId: string) {
  // Get merchant settings to know which plan they are on and what agents they enabled
  const { data: settings } = await supabase.from("merchant_agent_settings")
    .select("plan_key, enabled_agents")
    .eq("store_id", storeId)
    .single();

  const planKey = settings?.plan_key || 'pilot';
  
  // Get all active agents that are available for this plan
  const { data: agents } = await supabase.from("agents")
    .select("*")
    .eq("status", "active")
    .contains("plan_availability", [planKey]);
    
  return agents || [];
}

export async function getAgentByKey(key: string) {
  const { data: agent } = await supabase.from("agents")
    .select("*")
    .eq("key", key)
    .single();
    
  return agent;
}

export async function getAgentHierarchy(storeId: string) {
  const agents = await getAvailableAgents(storeId);
  
  // Build tree
  const router = agents.find(a => a.agent_level === 'router');
  const ceo = agents.find(a => a.agent_level === 'ceo');
  const managers = agents.filter(a => a.agent_level === 'manager');
  const specialists = agents.filter(a => a.agent_level === 'specialist');

  return {
    router,
    ceo,
    managers: managers.map(mgr => ({
      ...mgr,
      specialists: specialists.filter(sp => sp.parent_id === mgr.id)
    }))
  };
}

export async function getAgentsByLevel(level: 'router' | 'ceo' | 'manager' | 'specialist') {
  const { data: agents } = await supabase.from("agents")
    .select("*")
    .eq("agent_level", level)
    .eq("status", "active");
  return agents || [];
}

export async function getDepartmentManagers() {
  return getAgentsByLevel('manager');
}

export async function getSpecialistsForManager(managerKey: string) {
  const manager = await getAgentByKey(managerKey);
  if (!manager) return [];

  const { data: specialists } = await supabase.from("agents")
    .select("*")
    .eq("parent_id", manager.id)
    .eq("status", "active");
    
  return specialists || [];
}

export async function getAgentWithParent(agentKey: string) {
  const { data: agent } = await supabase.from("agents")
    .select("*, parent:agents!parent_id(*)")
    .eq("key", agentKey)
    .single();
    
  return agent;
}

export async function validateHierarchy() {
  const { data: orphans } = await supabase.from("agents")
    .select("key, name, agent_level")
    .is("parent_id", null)
    .not("agent_level", "in", "('router', 'ceo')");

  const { data: duplicateCheck } = await supabase.rpc('check_duplicate_agents'); // Assuming an RPC, or just log.
  
  return {
    orphans: orphans || [],
    isValid: orphans?.length === 0
  };
}

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import { supabase } from "~/utils/supabase.server";
import { ensureStoreForSession } from "~/utils/store.server";
import "~/styles/dashboard.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await ensureStoreForSession(session);

  if (!store) {
    return json({ workflows: [] });
  }

  // Fetch hierarchical workflows and their tasks
  const { data: workflows } = await supabase.from("agent_workflows")
    .select(`
      *,
      agent_tasks (
        id, task_type, status, result_summary, risk_score, created_at,
        assigned_to_agent_id,
        agent:agents!assigned_to_agent_id(name, department, agent_level)
      )
    `)
    .eq("store_id", store.id)
    .order("created_at", { ascending: false })
    .limit(10);

  // Fallback: Also fetch flat threads just in case hierarchical mode wasn't used for some
  const { data: threads } = await supabase.from("agent_threads")
    .select(`
      *,
      agent_decisions (*),
      agent_messages (
        observation,
        recommendation,
        risk_score,
        created_at,
        agents (name, department)
      )
    `)
    .eq("store_id", store.id)
    .order("created_at", { ascending: false })
    .limit(5);

  return json({ workflows: workflows || [], flatThreads: threads || [] });
};

export default function DebatePage() {
  const { workflows, flatThreads } = useLoaderData<typeof loader>();

  return (
    <div className="dashboard-layout animate-fade-in">
      <nav className="sidebar">
        <div className="sidebar-brand">ANOTAI</div>
        <ul className="sidebar-nav">
          <li><a className="sidebar-item" href="/app"><span className="sidebar-item-icon">📊</span> Dashboard</a></li>
          <li><a className="sidebar-item" href="/app/queue"><span className="sidebar-item-icon">⚡</span> Action Queue</a></li>
          <li><a className="sidebar-item active" href="/app/debate"><span className="sidebar-item-icon">🗣️</span> War Room</a></li>
          <li><a className="sidebar-item" href="/app/ai-team"><span className="sidebar-item-icon">🤖</span> AI Team</a></li>
          <li><a className="sidebar-item" href="/app/usage"><span className="sidebar-item-icon">📈</span> Usage</a></li>
        </ul>
      </nav>

      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">The War Room</h1>
          <p className="page-subtitle">
            Hierarchical logs of how your AI Agency delegates tasks and arrives at complex decisions.
          </p>
        </div>

        {workflows.length === 0 && flatThreads.length === 0 ? (
          <div className="empty-state card">
            <span className="empty-state-icon">🗣️</span>
            <h3 className="empty-state-title">No debates yet</h3>
            <p className="empty-state-text">Your agents haven't encountered any scenarios that required a War Room debate.</p>
          </div>
        ) : (
          <div className="feed-list">
            {/* Render Hierarchical Workflows */}
            {workflows.map((wf: any) => {
              const tasks = wf.agent_tasks || [];
              const ceoTask = tasks.find((t: any) => t.task_type === 'executive_review');
              const managerTask = tasks.find((t: any) => t.task_type === 'review_event');
              const specialistTasks = tasks.filter((t: any) => t.task_type === 'process_specialist_action');
              
              const rootAgent = ceoTask ? ceoTask.agent : (managerTask ? managerTask.agent : { name: "Orchestrator System" });

              return (
                <div key={wf.id} className="card" style={{ marginBottom: '24px', padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: 'var(--gray-400)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>
                        Workflow: {wf.workflow_type.replace(/_/g, ' ')} • Mode: {wf.mode.toUpperCase()}
                      </div>
                      <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--navy)' }}>
                        Event ID: {wf.event_id || 'Triggered Internally'}
                      </h3>
                    </div>
                    <div>
                      <span className={`badge ${wf.risk_level === 'high' ? 'badge-error' : wf.risk_level === 'medium' ? 'badge-warning' : 'badge-success'}`}>
                        Risk: {wf.risk_level.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="war-room-tree">
                    <div className="war-room-root">
                      {rootAgent.name} {ceoTask ? '(CEO)' : '(Department Manager)'}
                      <span style={{ fontSize: '12px', color: 'var(--gray-400)', marginLeft: '10px', fontWeight: 400 }}>
                        Status: {wf.status}
                      </span>
                    </div>

                    {/* If CEO is root, Manager is the first child */}
                    {ceoTask && managerTask && (
                      <div className="war-room-node">
                        <strong style={{ color: 'var(--ivory)' }}>{managerTask.agent?.name} (Manager)</strong>: 
                        <span style={{ color: 'var(--gray-300)', marginLeft: '8px' }}>{managerTask.result_summary}</span>
                        
                        {/* Nested Specialists under Manager */}
                        <div style={{ marginTop: '8px', marginLeft: '12px' }}>
                          {specialistTasks.map((st: any) => (
                            <div key={st.id} className="war-room-node" style={{ color: 'var(--gray-300)' }}>
                              <strong style={{ color: 'var(--gold)' }}>{st.agent?.name}</strong>: {st.result_summary}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* If Manager is root (No CEO) */}
                    {!ceoTask && managerTask && (
                      <div style={{ marginTop: '8px' }}>
                        {specialistTasks.map((st: any) => (
                          <div key={st.id} className="war-room-node" style={{ color: 'var(--gray-300)' }}>
                            <strong style={{ color: 'var(--gold)' }}>{st.agent?.name}</strong>: {st.result_summary}
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
                      <h4 style={{ fontSize: '12px', color: 'var(--gold)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '8px' }}>
                        Final Decision
                      </h4>
                      <p style={{ fontSize: '14px', lineHeight: '1.5', color: 'var(--ivory)' }}>
                        {ceoTask ? ceoTask.result_summary : (managerTask ? managerTask.result_summary : "Auto-executed successfully by system.")}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Render Legacy Flat Threads if any exist and no hierarchical workflows found */}
            {workflows.length === 0 && flatThreads.map((thread: any) => {
              const decision = thread.agent_decisions?.[0];
              const messages = thread.agent_messages || [];
              
              return (
                <div key={thread.id} className="card" style={{ marginBottom: '24px', padding: '24px', opacity: 0.7 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: 'var(--gray-400)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>
                        Legacy Flat Workflow: {thread.workflow_type.replace(/_/g, ' ')}
                      </div>
                      <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--navy)' }}>
                        Event ID: {thread.event_id || 'Triggered Internally'}
                      </h3>
                    </div>
                  </div>
                  <div style={{ background: 'var(--gray-50)', padding: '16px', borderRadius: '8px' }}>
                    <p style={{ fontSize: '13px', color: 'var(--gray-600)' }}>{decision?.reason_summary || 'No summary available.'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

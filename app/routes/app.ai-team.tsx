import { useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import { getAgentHierarchy } from "~/services/agentRegistry.server";
import { ensureStoreForSession } from "~/utils/store.server";
import "~/styles/dashboard.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await ensureStoreForSession(session);

  if (!store) {
    return json({ hierarchy: null });
  }

  const hierarchy = await getAgentHierarchy(store.id);
  return json({ hierarchy });
};

export default function AITeamPage() {
  const { hierarchy } = useLoaderData<typeof loader>();
  const [selectedAgent, setSelectedAgent] = useState<any | null>(null);

  if (!hierarchy) return <div className="empty-state">No store found.</div>;

  const { router, ceo, managers } = hierarchy;

  return (
    <div className="dashboard-layout animate-fade-in">
      <nav className="sidebar">
        <div className="sidebar-brand">ANOTAI</div>
        <ul className="sidebar-nav">
          <li><a className="sidebar-item" href="/app"><span className="sidebar-item-icon">📊</span> Dashboard</a></li>
          <li><a className="sidebar-item" href="/app/queue"><span className="sidebar-item-icon">⚡</span> Action Queue</a></li>
          <li><a className="sidebar-item" href="/app/debate"><span className="sidebar-item-icon">🗣️</span> War Room</a></li>
          <li><a className="sidebar-item active" href="/app/ai-team"><span className="sidebar-item-icon">🤖</span> AI Team</a></li>
          <li><a className="sidebar-item" href="/app/usage"><span className="sidebar-item-icon">📈</span> Usage</a></li>
        </ul>
      </nav>

      <main className="main-content" style={{ position: 'relative' }}>
        <div className="page-header">
          <h1 className="page-title">Virtual Agency Org Chart</h1>
          <p className="page-subtitle">Your fully autonomous revenue team structure. Activity-focused transparency.</p>
        </div>

        <div className="org-tree">
          {router && (
            <div className="org-level">
              <div className="org-node is-root" onClick={() => setSelectedAgent(router)}>
                <div className="org-node-role">{router.agent_level}</div>
                <div className="org-node-title">{router.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>{router.department}</div>
                <div className="org-node-stats">
                  <span>Status: <span style={{color: 'var(--green)'}}>Active</span></span>
                </div>
              </div>
            </div>
          )}

          {ceo && (
            <div className="org-level">
              <div className="org-node" onClick={() => setSelectedAgent(ceo)}>
                <div className="org-node-role">Chief Executive</div>
                <div className="org-node-title">{ceo.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>{ceo.department}</div>
                <div className="org-node-stats">
                  <span>Delegates: Yes</span>
                  <span>Safety: Enforced</span>
                </div>
              </div>
            </div>
          )}

          {managers && managers.length > 0 && (
            <div className={`org-level ${managers.length > 1 ? 'has-siblings' : ''}`} style={{ flexWrap: 'wrap' }}>
              {managers.map((mgr: any) => (
                <div key={mgr.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '0 20px' }}>
                  <div className="org-node" onClick={() => setSelectedAgent(mgr)} style={{ marginBottom: '40px', width: '280px' }}>
                    <div className="org-node-role">Dept. Manager</div>
                    <div className="org-node-title">{mgr.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>{mgr.department}</div>
                    <div className="org-node-stats">
                      <span>Team: {mgr.specialists?.length || 0}</span>
                      <span>Level: {mgr.agent_level}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '-40px', left: '50%', width: '2px', height: '40px', background: 'var(--gold)' }}></div>
                    {mgr.specialists?.map((spec: any) => (
                      <div key={spec.id} className="org-node" onClick={() => setSelectedAgent(spec)} style={{ width: '240px', padding: '12px', background: 'white' }}>
                        <div className="org-node-title" style={{ fontSize: '14px' }}>{spec.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--gray-500)' }}>{spec.permission_level.replace('_', ' ')}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedAgent && (
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '400px', background: 'white', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', zIndex: 100, padding: '40px', overflowY: 'auto' }} className="animate-fade-in">
            <button onClick={() => setSelectedAgent(null)} style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: 'var(--gray-400)' }}>×</button>
            <div className="badge badge-success" style={{ marginBottom: '20px' }}>Active & Ready</div>
            <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--navy)', marginBottom: '8px' }}>{selectedAgent.name}</h2>
            <div className="org-node-role">{selectedAgent.agent_level} • {selectedAgent.department}</div>
            <p style={{ fontSize: '14px', color: 'var(--gray-500)', marginTop: '20px', lineHeight: '1.6' }}>{selectedAgent.role_description}</p>
            <div style={{ marginTop: '40px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--gray-400)', marginBottom: '16px' }}>Agency Role</h3>
              <ul style={{ listStyle: 'none', padding: 0, fontSize: '14px', color: 'var(--navy)' }}>
                <li style={{ padding: '12px 0', borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Hierarchy Level</span>
                  <strong>{selectedAgent.agent_level}</strong>
                </li>
                <li style={{ padding: '12px 0', borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Can Delegate</span>
                  <strong>{selectedAgent.can_delegate ? 'Yes' : 'No'}</strong>
                </li>
                <li style={{ padding: '12px 0', borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Can Approve</span>
                  <strong>{selectedAgent.can_approve ? 'Yes' : 'No'}</strong>
                </li>
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

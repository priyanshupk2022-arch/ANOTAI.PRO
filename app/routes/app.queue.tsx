import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import { supabase } from "~/utils/supabase.server";
import { ensureStoreForSession } from "~/utils/store.server";
import { approveAction, rejectAction } from "~/services/actionQueue.server";
import "~/styles/dashboard.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await ensureStoreForSession(session);

  if (!store) {
    return json({ queue: [], summary: null });
  }

  // Fetch all recent actions to show audit trail
  const { data: queue } = await supabase.from("action_queue")
    .select("*")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Summary counts
  const summary = {
    pending: queue?.filter(a => a.status === "pending").length || 0,
    approved: queue?.filter(a => a.status === "approved").length || 0,
    executed: queue?.filter(a => a.status === "executed").length || 0,
    rejected: queue?.filter(a => a.status === "rejected").length || 0,
    failed: queue?.filter(a => a.status === "failed").length || 0,
  };

  return json({ queue: queue || [], summary });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await ensureStoreForSession(session);
  if (!store) return json({ success: false, error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const actionId = formData.get("actionId") as string;
  const intent = formData.get("intent") as string;
  const reason = formData.get("reason") as string || "";

  try {
    if (intent === "approve") {
      await approveAction(store.id, actionId, session.id || "merchant");
    } else if (intent === "reject") {
      await rejectAction(store.id, actionId, session.id || "merchant", reason);
    }
    return json({ success: true });
  } catch (error: any) {
    return json({ success: false, error: error.message }, { status: 400 });
  }
};

export default function ActionQueuePage() {
  const { queue, summary } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  return (
    <div className="dashboard-layout animate-fade-in">
      <nav className="sidebar">
        <div className="sidebar-brand">ANOTAI</div>
        <ul className="sidebar-nav">
          <li><a className="sidebar-item" href="/app"><span className="sidebar-item-icon">📊</span> Dashboard</a></li>
          <li><a className="sidebar-item active" href="/app/queue"><span className="sidebar-item-icon">⚡</span> Action Queue</a></li>
          <li><a className="sidebar-item" href="/app/debate"><span className="sidebar-item-icon">🗣️</span> War Room</a></li>
          <li><a className="sidebar-item" href="/app/ai-team"><span className="sidebar-item-icon">🤖</span> AI Team</a></li>
          <li><a className="sidebar-item" href="/app/usage"><span className="sidebar-item-icon">📈</span> Usage</a></li>
        </ul>
      </nav>

      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Action Queue</h1>
          <p className="page-subtitle">
            Review, approve, and audit actions proposed by your Virtual Agency.
          </p>
        </div>

        {/* SUMMARY BAR */}
        {summary && (
          <div className="agents-grid" style={{ marginBottom: '32px' }}>
            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--gray-400)', textTransform: 'uppercase', fontWeight: 700 }}>Pending</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--gold)' }}>{summary.pending}</div>
            </div>
            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--gray-400)', textTransform: 'uppercase', fontWeight: 700 }}>Executed</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--green)' }}>{summary.executed}</div>
            </div>
            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--gray-400)', textTransform: 'uppercase', fontWeight: 700 }}>Rejected</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--gray-500)' }}>{summary.rejected}</div>
            </div>
            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--gray-400)', textTransform: 'uppercase', fontWeight: 700 }}>Failed</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--red)' }}>{summary.failed}</div>
            </div>
          </div>
        )}

        {queue.length === 0 ? (
          <div className="empty-state card">
            <span className="empty-state-icon">✅</span>
            <h3 className="empty-state-title">No Actions Found</h3>
            <p className="empty-state-text">Your AI team hasn't proposed any actions requiring review yet.</p>
          </div>
        ) : (
          <div className="feed-list">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Agent & Status</th>
                  <th>Proposed Action</th>
                  <th>Details & Margin</th>
                  <th>Execution Audit</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item: any) => {
                  const payload = item.action_payload || {};
                  const isPending = item.status === "pending";
                  const isApproved = item.status === "approved";
                  const isExecuted = item.status === "executed";
                  const isRejected = item.status === "rejected";
                  const isFailed = item.status === "failed";
                  
                  const dangerousTypes = ["price_change", "refund", "bulk_email_campaign", "theme_code_change", "ad_budget_change", "app_install", "storewide_discount"];
                  const manualRequired = (isApproved || isPending) && dangerousTypes.includes(item.action_type);

                  return (
                    <tr key={item.id} style={{ opacity: (isRejected || isFailed) ? 0.6 : 1 }}>
                      <td style={{ verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 700, color: 'var(--navy)' }}>{item.proposed_by_agent.replace(/_/g, ' ')}</div>
                        <div style={{ marginTop: '4px' }}>
                          <span className={`badge ${
                            isPending ? 'badge-warning' : 
                            (isApproved || isExecuted) ? 'badge-success' : 'badge-error'
                          }`} style={{ fontSize: '10px' }}>
                            {isPending ? "PENDING" : "APPROVAL RECORDED"}
                          </span>
                        </div>
                        {manualRequired && (
                          <div style={{ marginTop: '8px' }}>
                            <span className="badge badge-warning" style={{ fontSize: '9px', background: 'var(--navy)', color: 'var(--gold)' }}>
                              MANUAL REQ.
                            </span>
                          </div>
                        )}
                      </td>
                      <td style={{ verticalAlign: 'top' }}>
                        <div style={{ color: 'var(--navy)', fontWeight: 600, fontSize: '13px' }}>
                          {item.action_type.replace(/_/g, ' ').toUpperCase()}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '4px' }}>
                          ID: {item.id.substring(0, 8)}...
                        </div>
                      </td>
                      <td style={{ verticalAlign: 'top', maxWidth: '300px' }}>
                        {item.action_type === "propose_alternative" ? (
                          <div style={{ fontSize: '12px', background: 'var(--gray-50)', padding: '10px', borderRadius: '4px' }}>
                            <div>Requested: <span style={{color: 'var(--red)'}}>{payload.requested_discount}%</span></div>
                            <div>Proposed: <strong style={{color: 'var(--gold)'}}>{payload.alternative_offer_value}%</strong></div>
                            {payload.final_estimated_margin && (
                              <div style={{marginTop: '4px', borderTop: '1px solid var(--gray-200)', paddingTop: '4px'}}>
                                Margin: <strong>{payload.final_estimated_margin}%</strong>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ fontSize: '11px', color: 'var(--gray-500)' }}>
                            {payload.email_subject || 'Payload details hidden'}
                          </div>
                        )}
                      </td>
                      <td style={{ verticalAlign: 'top', fontSize: '12px' }}>
                        {item.approved_at && (
                          <div style={{ color: 'var(--gray-500)' }}>
                            Approved: {new Date(item.approved_at).toLocaleDateString()}
                          </div>
                        )}
                        {item.executed_at && (
                          <div style={{ color: 'var(--green)' }}>
                            {isExecuted ? `Executed: ${new Date(item.executed_at).toLocaleTimeString()}` : "Approval recorded. Execution pending/manual if required."}
                          </div>
                        )}
                        {item.error_message && (
                          <div style={{ color: 'var(--red)', fontWeight: 600 }}>
                            Error: {item.error_message}
                          </div>
                        )}
                      </td>
                      <td style={{ verticalAlign: 'top' }}>
                        {isPending ? (
                          <fetcher.Form method="post" style={{ display: 'flex', gap: '8px' }}>
                            <input type="hidden" name="actionId" value={item.id} />
                            <button 
                              type="submit" 
                              name="intent" 
                              value="approve" 
                              className="btn-primary" 
                              style={{ padding: '6px 12px', fontSize: '12px', background: 'var(--gold)', color: 'var(--navy)' }}
                              disabled={fetcher.state !== "idle"}
                            >
                              Approve
                            </button>
                            <button 
                              type="submit" 
                              name="intent" 
                              value="reject" 
                              className="btn-primary" 
                              style={{ padding: '6px 12px', fontSize: '12px', background: 'var(--gray-200)', color: 'var(--navy)' }}
                              disabled={fetcher.state !== "idle"}
                            >
                              Reject
                            </button>
                          </fetcher.Form>
                        ) : (
                          <div style={{ fontSize: '11px', color: 'var(--gray-400)', fontStyle: 'italic' }}>
                            {isExecuted ? "Action Processed" : "Approval recorded. Pending execution."}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

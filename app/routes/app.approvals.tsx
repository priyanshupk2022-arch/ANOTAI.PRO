import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { AGENT_PROFILES } from "~/agents/profiles";
import {
  getPendingApprovals,
  getRecentApprovalDecisions,
  updateApprovalDecision,
} from "~/services/agent-controls.server";
import { authenticate } from "~/shopify.server";
import { ensureStoreForSession } from "~/utils/store.server";
import { AppSidebar } from "~/components/AppSidebar";
import "~/styles/dashboard.css";

type ActionResult = { success?: string; error?: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await ensureStoreForSession(session).catch((error) => {
    console.warn("Approvals store sync skipped:", error);
    return null;
  });

  if (!store) {
    return json({ approvals: [], recentDecisions: [], storeReady: false });
  }

  const [approvals, recentDecisions] = await Promise.all([
    getPendingApprovals(store.id).catch((error) => {
      console.warn("Approval queue fallback used:", error);
      return [];
    }),
    getRecentApprovalDecisions(store.id).catch((error) => {
      console.warn("Approval history fallback used:", error);
      return [];
    }),
  ]);

  return json({ approvals, recentDecisions, storeReady: true });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await ensureStoreForSession(session).catch((error) => {
    console.warn("Approval decision blocked:", error);
    return null;
  });

  if (!store) {
    return json<ActionResult>(
      { error: "Store connection is not ready. Try again when database/tunnel is healthy." },
      { status: 503 }
    );
  }

  const formData = await request.formData();
  const actionId = String(formData.get("action_id") || "");
  const decision = String(formData.get("decision") || "");

  if (!actionId || !["approved", "blocked"].includes(decision)) {
    return json<ActionResult>({ error: "Invalid approval decision." }, { status: 400 });
  }

  try {
    await updateApprovalDecision(store.id, actionId, decision as "approved" | "blocked");
  } catch (error) {
    return json<ActionResult>(
      { error: error instanceof Error ? error.message : "Approval decision could not be saved." },
      { status: 400 }
    );
  }

  return json<ActionResult>({
    success: decision === "approved" ? "Action approved." : "Action blocked.",
  });
};

export default function ApprovalsPage() {
  const { approvals, recentDecisions, storeReady } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  
  const approvalItems = (approvals || []).filter(Boolean);
  const decisionItems = (recentDecisions || []).filter(Boolean);

  return (
    <div className="dashboard-layout">
      <AppSidebar active="approvals" />

      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Approval Queue</h1>
          <p className="page-subtitle">
            Review risky or owner-controlled actions before ANOTAI executes them.
          </p>
        </div>

        {!storeReady && (
          <div className="badge badge-warning" style={{ width: '100%', padding: '16px', marginBottom: '24px', borderRadius: '12px' }}>
            ⚠️ Sync pending. Approvals require an active database connection.
          </div>
        )}
        {actionData?.success && <div className="badge badge-success" style={{ width: '100%', padding: '16px', marginBottom: '24px', borderRadius: '12px' }}>{actionData.success}</div>}
        {actionData?.error && <div className="badge badge-error" style={{ width: '100%', padding: '16px', marginBottom: '24px', borderRadius: '12px' }}>{actionData.error}</div>}

        <div className="card">
          <h2 className="section-title">Pending Actions ({approvalItems.length})</h2>
          {approvalItems.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state-icon">✨</span>
              <div className="empty-state-title">Inbox Zero</div>
              <p className="empty-state-text">No pending approvals. Your AI team is currently operating within your pre-approved safety zones.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {approvalItems.map((approval: any) => (
                <ApprovalCard approval={approval} key={approval.id} />
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="section-title">🛡️ How Approvals Work</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
            <div style={stepStyle}>
              <div style={stepNum}>1</div>
              <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '4px' }}>Agent Proposes</div>
              <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>An agent finds a revenue opportunity (like a personalized bundle).</div>
            </div>
            <div style={stepStyle}>
              <div style={stepNum}>2</div>
              <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '4px' }}>Queue Review</div>
              <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>The proposal appears here for your manual review and profit check.</div>
            </div>
            <div style={stepStyle}>
              <div style={stepNum}>3</div>
              <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '4px' }}>One-Click Deploy</div>
              <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Once approved, the offer goes live instantly to the customer.</div>
            </div>
          </div>
        </div>

        {decisionItems.length > 0 && (
          <div className="card">
            <h2 className="section-title">Recent Decisions</h2>
            <div style={{ display: "grid", gap: 12 }}>
              {decisionItems.map((approval: any) => (
                <DecisionCard approval={approval} key={approval.id} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function ApprovalCard({ approval }: { approval: any }) {
  const profile = AGENT_PROFILES.find((agent) => agent.name === approval.agent_name);
  const payload = approval.payload || {};

  return (
    <div className="card" style={{ marginBottom: 0, border: '1px solid var(--gray-200)', background: 'var(--gray-50)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <div className="agent-icon-box" style={{ width: 42, height: 42, marginBottom: 0 }}>{profile?.initials || "AI"}</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: "var(--navy)", fontSize: 16, fontWeight: 800 }}>
            {profile?.displayName || approval.agent_name}
          </div>
          <div style={{ color: "var(--gray-500)", fontSize: 12, textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>{humanize(approval.action_type)}</div>
        </div>
        <span className="badge badge-warning">Pending Review</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Detail label="Reason" value={payload.reason || "Owner approval required."} />
        <Detail label="Discount" value={payload.discount_pct ? `${payload.discount_pct}%` : "N/A"} />
        <Detail label="Impact" value={`$${Number(approval.revenue_impact || 0).toLocaleString()}`} />
      </div>

      <Form method="post" style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <input type="hidden" name="action_id" value={approval.id} />
        <button type="submit" name="decision" value="blocked" className="btn-primary" style={{ background: 'var(--gray-200)', color: 'var(--navy)' }}>Block</button>
        <button type="submit" name="decision" value="approved" className="btn-primary" style={{ background: 'var(--navy)' }}>Approve Action</button>
      </Form>
    </div>
  );
}

function DecisionCard({ approval }: { approval: any }) {
  const profile = AGENT_PROFILES.find((agent) => agent.name === approval.agent_name);
  const isApproved = approval.status === "approved";

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px', background: 'var(--gray-50)', borderRadius: '10px', border: '1px solid var(--gray-100)' }}>
      <div style={{ fontSize: '14px' }}>{profile?.initials || "AI"}</div>
      <div style={{ flex: 1 }}>
        <div style={{ color: "var(--navy)", fontSize: 13, fontWeight: 700 }}>
          {profile?.displayName || approval.agent_name} - {humanize(approval.action_type)}
        </div>
        <div style={{ color: "var(--gray-400)", fontSize: 11 }}>
          {new Date(approval.updated_at || approval.created_at).toLocaleString()}
        </div>
      </div>
      <span className={`badge ${isApproved ? 'badge-success' : 'badge-error'}`} style={{ fontSize: '10px' }}>
        {isApproved ? "Approved" : "Blocked"}
      </span>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'white', border: '1px solid var(--gray-100)', borderRadius: '8px', padding: '10px' }}>
      <div style={{ color: "var(--gray-400)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ color: "var(--navy)", fontSize: 12, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

const stepStyle: React.CSSProperties = {
  background: 'var(--gray-50)',
  padding: '20px',
  borderRadius: '12px',
  textAlign: 'center',
};

const stepNum: React.CSSProperties = {
  width: '28px',
  height: '28px',
  background: 'var(--navy)',
  color: 'white',
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  fontSize: '14px',
  fontWeight: 800,
  margin: '0 auto 12px',
};

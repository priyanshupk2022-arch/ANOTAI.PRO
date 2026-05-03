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
  const approvalItems = approvals.filter(
    (approval): approval is NonNullable<(typeof approvals)[number]> => approval !== null
  );
  const decisionItems = recentDecisions.filter(
    (approval): approval is NonNullable<(typeof recentDecisions)[number]> => approval !== null
  );

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
          <div style={warningStyle}>
            Approval queue needs the database/tunnel connection to be healthy.
          </div>
        )}
        {actionData?.success && <div style={successStyle}>{actionData.success}</div>}
        {actionData?.error && <div style={errorStyle}>{actionData.error}</div>}

        <div className="card">
          <h2 className="section-title">Pending Actions ({approvalItems.length})</h2>
          {approvalItems.length === 0 ? (
            <p style={{ color: "#94A3B8", fontSize: 14 }}>
              No pending actions. Agents will send risky work here when approval mode or safety limits require it.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {approvalItems.map((approval) => (
                <ApprovalCard approval={approval} key={approval.id} />
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="section-title">Recent Owner Decisions</h2>
          {decisionItems.length === 0 ? (
            <p style={{ color: "#94A3B8", fontSize: 14 }}>
              Approved and blocked actions will appear here after the owner makes a decision.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {decisionItems.map((approval) => (
                <DecisionCard approval={approval} key={approval.id} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ApprovalCard({ approval }: { approval: any }) {
  const profile = AGENT_PROFILES.find((agent) => agent.name === approval.agent_name);
  const payload = approval.payload || {};

  return (
    <div style={approvalCardStyle}>
      <div style={approvalHeaderStyle}>
        <span style={agentBadge}>{profile?.initials || "AI"}</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#0F172A", fontSize: 16, fontWeight: 900 }}>
            {profile?.displayName || approval.agent_name}
          </div>
          <div style={{ color: "#64748B", fontSize: 13 }}>{humanize(approval.action_type)}</div>
        </div>
        <span style={pendingPill}>Pending</span>
      </div>

      <div style={detailsGridStyle}>
        <Detail label="Reason" value={payload.reason || "Owner approval required."} />
        <Detail label="Discount" value={payload.discount_pct ? `${payload.discount_pct}%` : "N/A"} />
        <Detail label="Revenue Impact" value={`$${Number(approval.revenue_impact || 0).toLocaleString()}`} />
        <Detail label="Created" value={new Date(approval.created_at).toLocaleString()} />
      </div>

      <Form method="post" style={decisionRowStyle}>
        <input type="hidden" name="action_id" value={approval.id} />
        <button type="submit" name="decision" value="approved" style={approveButtonStyle}>
          Approve
        </button>
        <button type="submit" name="decision" value="blocked" style={blockButtonStyle}>
          Block
        </button>
      </Form>
    </div>
  );
}

function DecisionCard({ approval }: { approval: any }) {
  const profile = AGENT_PROFILES.find((agent) => agent.name === approval.agent_name);
  const payload = approval.payload || {};
  const isApproved = approval.status === "approved";

  return (
    <div style={decisionCardStyle}>
      <span style={agentBadge}>{profile?.initials || "AI"}</span>
      <div style={{ flex: 1 }}>
        <div style={{ color: "#0F172A", fontSize: 14, fontWeight: 900 }}>
          {profile?.displayName || approval.agent_name}
        </div>
        <div style={{ color: "#64748B", fontSize: 12 }}>
          {humanize(approval.action_type)} - {payload.owner_decided_at ? new Date(payload.owner_decided_at).toLocaleString() : new Date(approval.created_at).toLocaleString()}
        </div>
      </div>
      <span style={isApproved ? approvedPill : blockedPill}>
        {isApproved ? "Approved" : "Blocked"}
      </span>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={detailBoxStyle}>
      <div style={{ color: "#94A3B8", fontSize: 11, fontWeight: 900, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ color: "#0F172A", fontSize: 13, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

const approvalCardStyle: React.CSSProperties = {
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: 16,
  background: "#FFFFFF",
};

const approvalHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginBottom: 14,
};

const agentBadge: React.CSSProperties = {
  width: 38,
  height: 38,
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
  background: "#0F172A",
  color: "#FFFFFF",
  fontSize: 12,
  fontWeight: 900,
};

const pendingPill: React.CSSProperties = {
  borderRadius: 999,
  background: "#FEF3C7",
  color: "#92400E",
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 900,
};

const approvedPill: React.CSSProperties = {
  borderRadius: 999,
  background: "#DCFCE7",
  color: "#166534",
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 900,
};

const blockedPill: React.CSSProperties = {
  borderRadius: 999,
  background: "#FEE2E2",
  color: "#991B1B",
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 900,
};

const decisionCardStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: 12,
  background: "#FFFFFF",
};

const detailsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
  marginBottom: 14,
};

const detailBoxStyle: React.CSSProperties = {
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: 10,
};

const decisionRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
};

const approveButtonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 8,
  background: "#166534",
  color: "#FFFFFF",
  padding: "10px 16px",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
};

const blockButtonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 8,
  background: "#991B1B",
  color: "#FFFFFF",
  padding: "10px 16px",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
};

const successStyle: React.CSSProperties = {
  background: "#DCFCE7",
  color: "#166534",
  padding: "12px 16px",
  borderRadius: 8,
  marginBottom: 24,
  fontSize: 14,
  fontWeight: 700,
};

const errorStyle: React.CSSProperties = {
  background: "#FEE2E2",
  color: "#991B1B",
  padding: "12px 16px",
  borderRadius: 8,
  marginBottom: 24,
  fontSize: 14,
  fontWeight: 700,
};

const warningStyle: React.CSSProperties = {
  background: "#FEF3C7",
  color: "#92400E",
  padding: "12px 16px",
  borderRadius: 8,
  marginBottom: 24,
  fontSize: 14,
  fontWeight: 700,
};

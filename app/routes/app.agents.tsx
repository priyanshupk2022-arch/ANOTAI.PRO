import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { AGENT_PROFILES, DEFAULT_OWNER_CONTROLS } from "~/agents/profiles";
import type { AgentMode, AgentName } from "~/agents/profiles";
import { getAgentStatuses } from "~/agents/orchestrator";
import { updateAgentMode } from "~/services/agent-controls.server";
import { authenticate } from "~/shopify.server";
import { ensureStoreForSession } from "~/utils/store.server";
import { AppSidebar } from "~/components/AppSidebar";
import "~/styles/dashboard.css";

type ActionResult = { success?: string; error?: string };

const fallbackAgents = AGENT_PROFILES.map((profile) => ({
  name: profile.name,
  display_name: profile.displayName,
  emoji: profile.initials,
  color: "#0F172A",
  status: "active" as const,
  mode: DEFAULT_OWNER_CONTROLS.agentModes[profile.name],
  today_actions: 0,
  revenue_impact: 0,
}));

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await ensureStoreForSession(session).catch((error) => {
    console.warn("Agents store sync skipped:", error);
    return null;
  });

  if (!store) {
    return json({ agents: fallbackAgents, storeReady: false });
  }

  const agents = await getAgentStatuses(store.id).catch((error) => {
    console.warn("Agent status fallback used:", error);
    return fallbackAgents;
  });

  return json({ agents, storeReady: true });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await ensureStoreForSession(session).catch((error) => {
    console.warn("Agent mode update blocked:", error);
    return null;
  });

  if (!store) {
    return json<ActionResult>(
      { error: "Store connection is not ready. Try again after database/tunnel is healthy." },
      { status: 503 }
    );
  }

  const formData = await request.formData();
  const agentName = String(formData.get("agent_name") || "") as AgentName;
  const mode = String(formData.get("mode") || "") as AgentMode;

  if (!AGENT_PROFILES.some((profile) => profile.name === agentName)) {
    return json<ActionResult>({ error: "Unknown agent." }, { status: 400 });
  }

  if (!["approval", "auto", "locked"].includes(mode)) {
    return json<ActionResult>({ error: "Unknown agent mode." }, { status: 400 });
  }

  await updateAgentMode(store.id, agentName, mode);
  const profile = AGENT_PROFILES.find((item) => item.name === agentName);

  return json<ActionResult>({
    success: `${profile?.displayName || "Agent"} is now in ${modeLabel(mode)} mode.`,
  });
};

export default function AgentsPage() {
  const { agents, storeReady } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="dashboard-layout">
      <AppSidebar active="agents" />

      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Your AI Revenue Team</h1>
          <p className="page-subtitle">
            Owner decides whether each agent works in Approval, Auto, or Locked mode.
          </p>
        </div>

        {!storeReady && (
          <div style={warningStyle}>
            Controls are visible, but saving modes needs the database/tunnel connection to be healthy.
          </div>
        )}
        {actionData?.success && <div style={successStyle}>{actionData.success}</div>}
        {actionData?.error && <div style={errorStyle}>{actionData.error}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {agents.map((agent) => {
            const profile = AGENT_PROFILES.find((item) => item.name === agent.name);

            return (
              <div className="card" key={agent.name} style={{ marginBottom: 0 }}>
                <div style={headerStyle}>
                  <span style={agentBadge}>{agent.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>
                      {agent.display_name}
                    </div>
                    <div style={{ fontSize: 13, color: "#64748B" }}>{profile?.description}</div>
                  </div>
                  <ModePill mode={agent.mode} />
                </div>

                <div style={metricGrid}>
                  <div style={metricBox}>
                    <div style={metricValue}>{agent.today_actions}</div>
                    <div style={metricLabel}>Actions Today</div>
                  </div>
                  <div style={metricBox}>
                    <div style={{ ...metricValue, color: "#22C55E" }}>
                      ${(agent.revenue_impact || 0).toLocaleString()}
                    </div>
                    <div style={metricLabel}>Revenue Impact</div>
                  </div>
                  <div style={metricBox}>
                    <div style={metricValue}>{modeLabel(agent.mode)}</div>
                    <div style={metricLabel}>Owner Mode</div>
                  </div>
                </div>

                <div style={explainBox}>
                  <strong style={{ color: "#0F172A" }}>Mission:</strong> {profile?.mission}
                  <br />
                  <strong style={{ color: "#0F172A" }}>Auto allowed:</strong> {profile?.autoAllowed}
                  <br />
                  <strong style={{ color: "#0F172A" }}>Approval required:</strong>{" "}
                  {profile?.approvalRequired}
                </div>

                <Form method="post" style={modeFormStyle}>
                  <input type="hidden" name="agent_name" value={agent.name} />
                  <label style={selectLabelStyle}>
                    Owner mode
                    <select name="mode" defaultValue={agent.mode} style={selectStyle}>
                      <option value="approval">Approval - owner reviews first</option>
                      <option value="auto">Auto - execute inside safety limits</option>
                      <option value="locked">Locked - monitor only</option>
                    </select>
                  </label>
                  <button type="submit" style={saveButtonStyle}>Save Mode</button>
                </Form>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function ModePill({ mode }: { mode: AgentMode }) {
  const stylesByMode: Record<AgentMode, React.CSSProperties> = {
    approval: { background: "#FEF3C7", color: "#92400E" },
    auto: { background: "#DCFCE7", color: "#166534" },
    locked: { background: "#F1F5F9", color: "#475569" },
  };

  return (
    <div style={{ ...activePill, ...stylesByMode[mode] }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
      <span>{modeLabel(mode)}</span>
    </div>
  );
}

function modeLabel(mode: AgentMode) {
  if (mode === "auto") return "Auto";
  if (mode === "locked") return "Locked";
  return "Approval";
}

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  marginBottom: 16,
};

const agentBadge: React.CSSProperties = {
  width: 42,
  height: 42,
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
  background: "#0F172A",
  color: "#FFFFFF",
  fontSize: 13,
  fontWeight: 900,
};

const activePill: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 12px",
  borderRadius: 100,
  fontSize: 12,
  fontWeight: 800,
};

const metricGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 12,
  marginBottom: 16,
};

const metricBox: React.CSSProperties = {
  background: "#F8FAFC",
  borderRadius: 8,
  padding: "12px 16px",
  textAlign: "center",
};

const metricValue: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  color: "#0F172A",
};

const metricLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#94A3B8",
};

const explainBox: React.CSSProperties = {
  background: "#F8FAFC",
  borderRadius: 8,
  padding: "12px 16px",
  fontSize: 13,
  color: "#475569",
  lineHeight: 1.6,
  marginBottom: 14,
};

const modeFormStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  alignItems: "end",
  gap: 12,
};

const selectLabelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  color: "#334155",
  fontSize: 12,
  fontWeight: 800,
};

const selectStyle: React.CSSProperties = {
  minHeight: 40,
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  padding: "0 12px",
  fontSize: 14,
  color: "#0F172A",
  background: "#FFFFFF",
};

const saveButtonStyle: React.CSSProperties = {
  minHeight: 40,
  border: "none",
  borderRadius: 8,
  background: "#0F172A",
  color: "#FFFFFF",
  padding: "0 18px",
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

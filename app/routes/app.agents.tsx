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
            Configure how each specialized agent operates. Approval mode is recommended for beta stores.
          </p>
        </div>

        {!storeReady && (
          <div style={warningStyle}>
            Controls are visible, but saving modes needs the database connection to be healthy.
          </div>
        )}
        {actionData?.success && <div style={successStyle}>{actionData.success}</div>}
        {actionData?.error && <div style={errorStyle}>{actionData.error}</div>}

        <div className="agents-grid">
          {agents.map((agent) => {
            const profile = AGENT_PROFILES.find((item) => item.name === agent.name);

            return (
              <div className="agent-card-premium" key={agent.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                  <div className="agent-icon-box" style={{ marginBottom: 0 }}>{agent.emoji}</div>
                  <ModePill mode={agent.mode} />
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--navy)', marginBottom: '4px' }}>{agent.display_name}</h3>
                  <p style={{ fontSize: '13px', color: 'var(--gray-500)', lineHeight: '1.4' }}>{profile?.description}</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                  <div style={{ background: 'var(--gray-50)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--navy)' }}>{agent.today_actions}</div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Actions</div>
                  </div>
                  <div style={{ background: 'var(--gray-50)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--green)' }}>${(agent.revenue_impact || 0).toLocaleString()}</div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Impact</div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--gray-100)', paddingTop: '16px', marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--gray-600)', marginBottom: '8px' }}>
                    <strong style={{ color: 'var(--navy)' }}>Mission:</strong> {profile?.mission}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--gray-600)' }}>
                    <strong style={{ color: 'var(--navy)' }}>Safety:</strong> {profile?.approvalRequired}
                  </div>
                </div>

                <Form method="post" style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                  <input type="hidden" name="agent_name" value={agent.name} />
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>Owner Mode</label>
                    <select name="mode" defaultValue={agent.mode} className="form-input" style={{ fontSize: '13px', height: '38px' }}>
                      <option value="approval">Approval Mode</option>
                      <option value="auto">Auto Mode</option>
                      <option value="locked">Locked</option>
                    </select>
                  </div>
                  <button type="submit" className="btn-primary" style={{ height: '38px', padding: '0 12px', fontSize: '12px' }}>Save</button>
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
    <div className="badge" style={{ ...stylesByMode[mode], padding: '4px 10px' }}>
      <span className="status-dot active" style={{ backgroundColor: 'currentColor', marginRight: '6px' }} />
      {modeLabel(mode)}
    </div>
  );
}

function modeLabel(mode: AgentMode) {
  if (mode === "auto") return "Auto";
  if (mode === "locked") return "Locked";
  return "Approval";
}

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

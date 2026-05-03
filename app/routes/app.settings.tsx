import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { DEFAULT_OWNER_CONTROLS } from "~/agents/profiles";
import { getOwnerControls, updateSafetySettings, updateStorePlaybook } from "~/services/agent-controls.server";
import { authenticate } from "~/shopify.server";
import { ensureStoreForSession } from "~/utils/store.server";
import { AppSidebar } from "~/components/AppSidebar";
import "~/styles/dashboard.css";

type ActionResult = { success?: string; error?: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await ensureStoreForSession(session).catch((error) => {
    console.warn("Settings store sync fallback used:", error);
    return null;
  });

  if (!store) {
    return json({
      shop: session.shop,
      planStatus: "setup_pending",
      storeReady: false,
      appUrl: process.env.SHOPIFY_APP_URL || "",
      controls: DEFAULT_OWNER_CONTROLS,
    });
  }

  const controls = await getOwnerControls(store.id).catch((error) => {
    console.warn("Owner controls fallback used:", error);
    return DEFAULT_OWNER_CONTROLS;
  });

  return json({
    shop: session.shop,
    planStatus: store.plan_status,
    storeReady: true,
    appUrl: process.env.SHOPIFY_APP_URL || "",
    controls,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await ensureStoreForSession(session).catch((error) => {
    console.warn("Safety settings update blocked:", error);
    return null;
  });

  if (!store) {
    return json<ActionResult>(
      { error: "Store connection is not ready. Try again after database/tunnel is healthy." },
      { status: 503 }
    );
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "safety");

  if (intent === "playbook") {
    const brandVoice = limitedText(formData.get("brandVoice"), 120);
    const targetRevenueRange = limitedText(formData.get("targetRevenueRange"), 80);
    const bestsellerCategories = csvList(formData.get("bestsellerCategories"), 8);
    const approvedClaims = csvList(formData.get("approvedClaims"), 12);
    const forbiddenClaims = csvList(formData.get("forbiddenClaims"), 16);

    if (!brandVoice || bestsellerCategories.length === 0) {
      return json<ActionResult>(
        { error: "Brand voice and bestseller categories are required." },
        { status: 400 }
      );
    }

    await updateStorePlaybook(store.id, {
      niche: "beauty_skincare",
      brandVoice,
      targetRevenueRange: targetRevenueRange || "$50k-$500k/month US Shopify beauty stores",
      bestsellerCategories,
      approvedClaims: approvedClaims.length ? approvedClaims : DEFAULT_OWNER_CONTROLS.playbook.approvedClaims,
      forbiddenClaims: forbiddenClaims.length ? forbiddenClaims : DEFAULT_OWNER_CONTROLS.playbook.forbiddenClaims,
      defaultRoutineSteps: DEFAULT_OWNER_CONTROLS.playbook.defaultRoutineSteps,
    });

    return json<ActionResult>({ success: "Beauty/skincare Store Playbook saved." });
  }

  const minMarginPct = boundedNumber(formData.get("minMarginPct"), 1, 90);
  const maxDiscountPct = boundedNumber(formData.get("maxDiscountPct"), 0, 80);
  const dailyEmailLimit = boundedNumber(formData.get("dailyEmailLimit"), 0, 5000);
  const autoRevenueLimit = boundedNumber(formData.get("autoRevenueLimit"), 0, 100000);
  const approvalRequiredAboveDiscountPct = boundedNumber(
    formData.get("approvalRequiredAboveDiscountPct"),
    0,
    80
  );

  if (
    minMarginPct === null ||
    maxDiscountPct === null ||
    dailyEmailLimit === null ||
    autoRevenueLimit === null ||
    approvalRequiredAboveDiscountPct === null
  ) {
    return json<ActionResult>({ error: "All safety values must be valid numbers." }, { status: 400 });
  }

  if (approvalRequiredAboveDiscountPct > maxDiscountPct) {
    return json<ActionResult>(
      { error: "Approval discount threshold must be equal to or below the maximum discount." },
      { status: 400 }
    );
  }

  await updateSafetySettings(store.id, {
    minMarginPct,
    maxDiscountPct,
    dailyEmailLimit,
    autoRevenueLimit,
    approvalRequiredAboveDiscountPct,
  });

  return json<ActionResult>({ success: "Owner safety settings saved." });
};

export default function SettingsPage() {
  const { shop, planStatus, storeReady, appUrl, controls } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const safety = controls.safety;
  const playbook = controls.playbook;

  return (
    <div className="dashboard-layout">
      <AppSidebar active="settings" />

      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Owner Controls</h1>
          <p className="page-subtitle">
            Decide how autonomous ANOTAI can be before actions need your approval.
          </p>
        </div>

        {!storeReady && (
          <div style={warningStyle}>
            Settings are visible, but saving needs the database/tunnel connection to be healthy.
          </div>
        )}
        {actionData?.success && <div style={successStyle}>{actionData.success}</div>}
        {actionData?.error && <div style={errorStyle}>{actionData.error}</div>}

        <div className="card">
          <h2 className="section-title">Store</h2>
          <div className="feed-list">
            <SettingRow label="Shop domain" value={shop} />
            <SettingRow label="Plan status" value={planStatus} />
            <SettingRow label="Current app URL" value={appUrl || "Not configured"} />
          </div>
        </div>

        <div className="card">
          <h2 className="section-title">Safety Rules</h2>
          <Form method="post" style={settingsGridStyle}>
            <input type="hidden" name="intent" value="safety" />
            <NumberField
              label="Minimum margin floor (%)"
              name="minMarginPct"
              defaultValue={safety.minMarginPct}
              min={1}
              max={90}
              help="Margin Guardian blocks offers that violate this floor."
            />
            <NumberField
              label="Maximum discount (%)"
              name="maxDiscountPct"
              defaultValue={safety.maxDiscountPct}
              min={0}
              max={80}
              help="No agent can exceed this discount, even in Auto mode."
            />
            <NumberField
              label="Approval required above discount (%)"
              name="approvalRequiredAboveDiscountPct"
              defaultValue={safety.approvalRequiredAboveDiscountPct}
              min={0}
              max={80}
              help="Auto mode pauses and asks approval above this discount."
            />
            <NumberField
              label="Daily email limit"
              name="dailyEmailLimit"
              defaultValue={safety.dailyEmailLimit}
              min={0}
              max={5000}
              help="Retention and recovery agents must stay under this cap."
            />
            <NumberField
              label="Auto revenue impact limit ($)"
              name="autoRevenueLimit"
              defaultValue={safety.autoRevenueLimit}
              min={0}
              max={100000}
              help="Actions above this estimated impact require approval."
            />
            <div style={{ display: "flex", alignItems: "end" }}>
              <button type="submit" style={saveButtonStyle}>Save Safety Rules</button>
            </div>
          </Form>
        </div>

        <div className="card">
          <h2 className="section-title">Beauty Store Playbook</h2>
          <p style={helpStyle}>
            Personal Shopper uses this to stay focused on US beauty/skincare stores, approved claims,
            and approval-first selling.
          </p>
          <Form method="post" style={settingsGridStyle}>
            <input type="hidden" name="intent" value="playbook" />
            <TextField
              label="Brand voice"
              name="brandVoice"
              defaultValue={playbook.brandVoice}
              help="Example: expert, friendly, clear, confidence-building."
            />
            <TextField
              label="Target revenue range"
              name="targetRevenueRange"
              defaultValue={playbook.targetRevenueRange}
              help="Keep the ICP narrow for the first beta."
            />
            <TextAreaField
              label="Bestseller categories"
              name="bestsellerCategories"
              defaultValue={playbook.bestsellerCategories.join(", ")}
              help="Comma-separated, e.g. cleanser, serum, moisturizer, sunscreen."
            />
            <TextAreaField
              label="Approved claims"
              name="approvedClaims"
              defaultValue={playbook.approvedClaims.join(", ")}
              help="Only honest, store-approved skincare benefit language."
            />
            <TextAreaField
              label="Forbidden claims"
              name="forbiddenClaims"
              defaultValue={playbook.forbiddenClaims.join(", ")}
              help="Blocked claims: fairness guarantee, medical cures, fake urgency, fake reviews."
            />
            <div style={{ display: "flex", alignItems: "end" }}>
              <button type="submit" style={saveButtonStyle}>Save Playbook</button>
            </div>
          </Form>
        </div>

        <div className="card">
          <h2 className="section-title">Setup Checklist</h2>
          <div className="feed-list">
            <SettingRow label="COGS data" value="Required for Margin Guardian" />
            <SettingRow label="Web Pixel" value="Required for Retention Engine" />
            <SettingRow label="Billing" value="Required before production launch" />
          </div>
        </div>

        <div className="card">
          <h2 className="section-title">Next Actions</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link to="/app/agents" className="restock-btn">Open Agents</Link>
            <Link to="/app/cogs" className="restock-btn">Open COGS</Link>
            <Link to="/app/pixel" className="restock-btn">Open Pixel</Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="feed-item">
      <span className="feed-text">{label}</span>
      <span className="feed-time">{value}</span>
    </div>
  );
}

function NumberField({
  label,
  name,
  defaultValue,
  help,
  min,
  max,
}: {
  label: string;
  name: string;
  defaultValue: number;
  help: string;
  min: number;
  max: number;
}) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <input name={name} type="number" min={min} max={max} step="1" defaultValue={defaultValue} style={inputStyle} />
      <small style={helpStyle}>{help}</small>
    </label>
  );
}

function TextField({
  label,
  name,
  defaultValue,
  help,
}: {
  label: string;
  name: string;
  defaultValue: string;
  help: string;
}) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <input name={name} type="text" maxLength={120} defaultValue={defaultValue} style={inputStyle} />
      <small style={helpStyle}>{help}</small>
    </label>
  );
}

function TextAreaField({
  label,
  name,
  defaultValue,
  help,
}: {
  label: string;
  name: string;
  defaultValue: string;
  help: string;
}) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <textarea name={name} maxLength={800} defaultValue={defaultValue} style={textareaStyle} />
      <small style={helpStyle}>{help}</small>
    </label>
  );
}

function boundedNumber(value: FormDataEntryValue | null, min: number, max: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < min || numberValue > max) return null;
  return numberValue;
}

function limitedText(value: FormDataEntryValue | null, maxLength: number) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function csvList(value: FormDataEntryValue | null, maxItems: number) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, maxItems);
}

const settingsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  fontWeight: 800,
  color: "#334155",
};

const inputStyle: React.CSSProperties = {
  minHeight: 40,
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  padding: "0 12px",
  fontSize: 14,
};

const textareaStyle: React.CSSProperties = {
  minHeight: 96,
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
  resize: "vertical",
};

const helpStyle: React.CSSProperties = {
  color: "#64748B",
  fontSize: 12,
  fontWeight: 500,
  lineHeight: 1.4,
};

const saveButtonStyle: React.CSSProperties = {
  minHeight: 40,
  width: "100%",
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

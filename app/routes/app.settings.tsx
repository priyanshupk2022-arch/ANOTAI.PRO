import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { DEFAULT_OWNER_CONTROLS } from "~/agents/profiles";
import { getOwnerControls, updateSafetySettings, updateStorePlaybook } from "~/services/agent-controls.server";
import { authenticate } from "~/shopify.server";
import { ensureStoreForSession } from "~/utils/store.server";
import { AppSidebar } from "~/components/AppSidebar";
import { supabase } from "~/utils/supabase.server";
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
      onboardingStatus: {
        hasCOGS: false,
        hasActions: false,
        safetyConfigured: false,
        recoveryEnabled: false,
        playbookDone: false,
      }
    });
  }

  const [controls, hasCOGS, hasActions, safetySettings] = await Promise.all([
    getOwnerControls(store.id).catch(() => DEFAULT_OWNER_CONTROLS),
    supabase.from("products_cogs").select("id").eq("store_id", store.id).limit(1).then(r => !!r.data?.length),
    supabase.from("agent_actions").select("id").eq("store_id", store.id).limit(1).then(r => !!r.data?.length),
    supabase.from("merchant_agent_settings").select("*").eq("store_id", store.id).single().then(r => r.data),
  ]);

  return json({
    shop: session.shop,
    planStatus: store.plan_status,
    storeReady: true,
    appUrl: process.env.SHOPIFY_APP_URL || "",
    controls,
    onboardingStatus: {
      hasCOGS,
      hasActions,
      safetyConfigured: Boolean(safetySettings),
      recoveryEnabled: safetySettings?.recovery_emails_enabled || false,
      playbookDone: Boolean(controls.playbook.brandVoice),
    }
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
  const { shop, planStatus, storeReady, appUrl, controls, onboardingStatus } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const safety = controls.safety;
  const playbook = controls.playbook;

  return (
    <div className="dashboard-layout">
      <AppSidebar active="settings" />

      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Settings & Safety</h1>
          <p className="page-subtitle">
            Configure your ANOTAI revenue operating system and daily safety gates.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            
            {actionData?.success && <div style={successStyle}>{actionData.success}</div>}
            {actionData?.error && <div style={errorStyle}>{actionData.error}</div>}
            {!storeReady && (
              <div style={warningStyle}>
                Settings are visible, but saving needs the database connection to be healthy.
              </div>
            )}

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
                  help="Guardian blocks offers that violate this floor."
                />
                <NumberField
                  label="Maximum discount (%)"
                  name="maxDiscountPct"
                  defaultValue={safety.maxDiscountPct}
                  min={0}
                  max={80}
                  help="No agent can exceed this discount cap."
                />
                <NumberField
                  label="Daily email limit"
                  name="dailyEmailLimit"
                  defaultValue={safety.dailyEmailLimit}
                  min={0}
                  max={5000}
                  help="Retention agents must stay under this cap."
                />
                <NumberField
                  label="Auto revenue limit ($)"
                  name="autoRevenueLimit"
                  defaultValue={safety.autoRevenueLimit}
                  min={0}
                  max={100000}
                  help="Actions above this impact require approval."
                />
                <div style={{ gridColumn: '1 / -1', marginTop: '12px' }}>
                  <button type="submit" className="btn-primary" style={{ background: 'var(--navy)', width: 'auto', padding: '12px 24px' }}>Save Safety Rules</button>
                </div>
              </Form>
            </div>

            <div className="card">
              <h2 className="section-title">Store Playbook</h2>
              <Form method="post" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <input type="hidden" name="intent" value="playbook" />
                <TextField
                  label="Brand voice"
                  name="brandVoice"
                  defaultValue={playbook.brandVoice}
                  help="Example: expert, friendly, clear, confidence-building."
                />
                <TextAreaField
                  label="Bestseller categories"
                  name="bestsellerCategories"
                  defaultValue={playbook.bestsellerCategories.join(", ")}
                  help="Comma-separated categories for the Personal Shopper."
                />
                <button type="submit" className="btn-primary" style={{ background: 'var(--primary)', width: 'auto', padding: '12px 24px' }}>Update Playbook</button>
              </Form>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div className="card">
              <h2 className="section-title">🚀 Launch Checklist</h2>
              <div className="feed-list">
                <ChecklistItem label="Brand Playbook" description="Expert training for AI agents" status={onboardingStatus.playbookDone ? 'done' : 'pending'} />
                <ChecklistItem label="COGS Added" description="Required for margin protection" status={onboardingStatus.hasCOGS ? 'done' : 'pending'} />
                <ChecklistItem label="Safety Config" description="Daily limits & automation gates" status={onboardingStatus.safetyConfigured ? 'done' : 'pending'} />
                <ChecklistItem label="Cart Recovery" description="Enable Cart Sniper engine" status={onboardingStatus.recoveryEnabled ? 'done' : 'pending'} />
                <ChecklistItem label="Billing" description="Active Shopify subscription" status={planStatus === 'active' ? 'done' : 'pending'} />
              </div>
            </div>

            <div className="card">
              <h2 className="section-title">🏪 Store Identity</h2>
              <div className="feed-list">
                <div className="feed-item" style={{ border: 'none', padding: '12px 0' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', color: 'var(--gray-400)', fontWeight: 700, textTransform: 'uppercase' }}>Shop domain</div>
                    <div style={{ fontWeight: 600, color: 'var(--navy)', fontSize: '14px' }}>{shop}</div>
                  </div>
                </div>
                <div className="feed-item" style={{ border: 'none', padding: '12px 0' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', color: 'var(--gray-400)', fontWeight: 700, textTransform: 'uppercase' }}>Plan Status</div>
                    <div className={`badge ${planStatus === 'active' ? 'badge-success' : 'badge-warning'}`} style={{ marginTop: '4px' }}>{planStatus.replace('_', ' ')}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function ChecklistItem({ label, description, status }: { label: string; description: string; status: 'done' | 'pending' }) {
  return (
    <div className="feed-item" style={{ padding: '16px 0' }}>
      <div style={{ marginRight: '16px' }}>
        {status === 'done' ? (
          <div style={{ color: 'var(--green)', fontSize: '18px' }}>✅</div>
        ) : (
          <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid var(--gray-200)' }} />
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: '13px' }}>{label}</div>
        <div style={{ fontSize: '11px', color: 'var(--gray-500)' }}>{description}</div>
      </div>
    </div>
  );
}

function NumberField({ label, name, defaultValue, help, min, max }: { label: string; name: string; defaultValue: number; help: string; min: number; max: number }) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <input name={name} type="number" min={min} max={max} step="1" defaultValue={defaultValue} style={inputStyle} />
      <small style={helpStyle}>{help}</small>
    </label>
  );
}

function TextField({ label, name, defaultValue, help }: { label: string; name: string; defaultValue: string; help: string }) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <input name={name} type="text" maxLength={120} defaultValue={defaultValue} style={inputStyle} />
      <small style={helpStyle}>{help}</small>
    </label>
  );
}

function TextAreaField({ label, name, defaultValue, help }: { label: string; name: string; defaultValue: string; help: string }) {
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
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 20,
};

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: '12px',
  fontWeight: 700,
  color: "var(--navy)",
};

const inputStyle: React.CSSProperties = {
  minHeight: 40,
  border: "1px solid var(--gray-200)",
  borderRadius: 8,
  padding: "0 12px",
  fontSize: 14,
  fontFamily: 'inherit'
};

const textareaStyle: React.CSSProperties = {
  minHeight: 80,
  border: "1px solid var(--gray-200)",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
  resize: "vertical",
  fontFamily: 'inherit'
};

const helpStyle: React.CSSProperties = {
  color: "var(--gray-400)",
  fontSize: 11,
  fontWeight: 500,
  lineHeight: 1.4,
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

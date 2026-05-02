import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import { supabase } from "~/utils/supabase.server";
import { ensureStoreForSession } from "~/utils/store.server";
import "~/styles/dashboard.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await ensureStoreForSession(session);
  
  // If already onboarded, redirect to dashboard (optional check)
  // if (store.settings?.onboarded) return redirect("/app");

  return json({});
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const toNumber = (value: FormDataEntryValue | null) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const toList = (value: FormDataEntryValue | null) =>
    String(value ?? "")
      .split(",")
      .map((category) => category.trim())
      .filter(Boolean);
  const categories = toList(formData.get("categories"));

  const settings = {
    niche: String(formData.get("niche") || ""),
    brand_voice: String(formData.get("brand_voice") || ""),
    max_discount: toNumber(formData.get("max_discount")),
    margin_target: toNumber(formData.get("margin_target")),
    autonomy_mode: String(formData.get("autonomy_mode") || ""),
    email_limit: toNumber(formData.get("email_limit")),
    bestseller_categories: categories,
    onboarded: true
  };

  const { error } = await supabase.from("stores")
    .update({ settings })
    .eq("shop_domain", session.shop);

  if (error) return json({ error: "Failed to save settings" }, { status: 500 });
  return redirect("/app");
};

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();

  const next = () => setStep(s => s + 1);
  const prev = () => setStep(s => s - 1);

  return (
    <div className="dashboard-layout animate-fade-in" style={{ justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div className="card" style={{ maxWidth: '600px', width: '100%', padding: '40px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 className="page-title" style={{ fontSize: '28px' }}>Setup Your AI Playbook</h1>
          <p className="page-subtitle">Let's train your AI agents on your brand's unique voice and rules.</p>
        </div>
        {actionData?.error && (
          <div className="badge badge-error" style={{ width: "100%", marginBottom: "20px", padding: "12px", borderRadius: "10px" }}>
            {actionData.error}
          </div>
        )}

        <div style={{ marginBottom: '32px' }}>
          <div style={{ height: '4px', background: '#F1F5F9', borderRadius: '2px' }}>
            <div style={{ height: '100%', width: `${(step / 4) * 100}%`, background: 'var(--primary)', transition: 'width 0.3s ease', borderRadius: '2px' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px', fontWeight: 700, color: 'var(--gray-400)' }}>
            <span>Step {step} of 4</span>
            <span>{step === 4 ? 'Finalizing' : 'Keep going!'}</span>
          </div>
        </div>

        <Form method="post">
          {step === 1 && (
            <div className="animate-fade-in">
              <h2 className="section-title">Store Identity</h2>
              <div style={{ display: 'grid', gap: '20px' }}>
                <div>
                  <label style={labelStyle}>What is your niche?</label>
                  <select name="niche" className="form-input" required>
                    <option value="skincare">Skincare</option>
                    <option value="haircare">Haircare</option>
                    <option value="cosmetics">Cosmetics</option>
                    <option value="wellness">Wellness</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Brand Voice</label>
                  <select name="brand_voice" className="form-input" required>
                    <option value="professional">Professional & Scientific</option>
                    <option value="friendly">Friendly & Relatable</option>
                    <option value="playful">Playful & Bold</option>
                    <option value="luxury">Luxury & Minimalist</option>
                  </select>
                </div>
                <button type="button" onClick={next} className="btn-primary" style={{ width: '100%' }}>Continue</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-fade-in">
              <h2 className="section-title">Safety & Profit Floors</h2>
              <div style={{ display: 'grid', gap: '20px' }}>
                <div>
                  <label style={labelStyle}>Max Discount AI can offer (%)</label>
                  <input name="max_discount" type="number" defaultValue="20" className="form-input" required />
                </div>
                <div>
                  <label style={labelStyle}>Target Margin Floor (%)</label>
                  <input name="margin_target" type="number" defaultValue="30" className="form-input" required />
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" onClick={prev} className="btn-primary" style={{ background: 'var(--gray-100)', color: 'var(--navy)', flex: 1 }}>Back</button>
                  <button type="button" onClick={next} className="btn-primary" style={{ flex: 2 }}>Next Step</button>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-fade-in">
              <h2 className="section-title">Agent Operations</h2>
              <div style={{ display: 'grid', gap: '20px' }}>
                <div>
                  <label style={labelStyle}>Autonomy Mode</label>
                  <select name="autonomy_mode" className="form-input" required>
                    <option value="approval_first">Approval First (Recommended)</option>
                    <option value="semi_auto">Semi-Autonomous</option>
                    <option value="full_auto">Fully Autonomous</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Max Recovery Emails (per week/user)</label>
                  <input name="email_limit" type="number" defaultValue="3" className="form-input" required />
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" onClick={prev} className="btn-primary" style={{ background: 'var(--gray-100)', color: 'var(--navy)', flex: 1 }}>Back</button>
                  <button type="button" onClick={next} className="btn-primary" style={{ flex: 2 }}>Next Step</button>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="animate-fade-in">
              <h2 className="section-title">Product Focus</h2>
              <div style={{ display: 'grid', gap: '20px' }}>
                <div>
                  <label style={labelStyle}>Bestseller Categories (comma separated)</label>
                  <input name="categories" placeholder="Serums, Cleansers, Sunscreen" className="form-input" required />
                </div>
                <p style={{ fontSize: '13px', color: 'var(--gray-500)', textAlign: 'center' }}>
                  By clicking Launch, you agree to allow AI agents to interact with customers based on these safety zones.
                </p>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" onClick={prev} className="btn-primary" style={{ background: 'var(--gray-100)', color: 'var(--navy)', flex: 1 }}>Back</button>
                  <button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={nav.state !== "idle"}>
                    {nav.state !== "idle" ? "Launching..." : "Launch AI Playbook"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </Form>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 700,
  color: 'var(--navy)',
  marginBottom: '8px'
};

/**
 * 🔧 ADMIN DEBUG PAGE — Internal Use Only
 *
 * Protected by ADMIN_DEBUG_TOKEN env var.
 * NOT customer-facing. Shows system health, errors, and kill switch status.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { getRecentErrors } from "~/services/errorLogger.server";
import { getGlobalKillSwitchStatus } from "~/services/killSwitch.server";
import { supabase } from "~/utils/supabase.server";
import "~/styles/dashboard.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // ── Dev/Admin Access Check ──────────────────────────────────────────
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || request.headers.get("x-debug-token");
  const expectedToken = process.env.ADMIN_DEBUG_TOKEN;

  if (!expectedToken || token !== expectedToken) {
    throw new Response("Forbidden", { status: 403 });
  }

  const [errors, killSwitches, failedActions, usageSummary] = await Promise.all([
    getRecentErrors(undefined, 30),
    Promise.resolve(getGlobalKillSwitchStatus()),
    supabase.from("action_queue").select("id, store_id, action_type, status, error_message, created_at")
      .in("status", ["failed"])
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("monthly_usage_counters").select("store_id, billing_month, ai_interactions_used, recovery_emails_sent, estimated_ai_cost")
      .eq("billing_month", new Date().toISOString().slice(0, 7))
      .order("ai_interactions_used", { ascending: false })
      .limit(20),
  ]);

  return json({
    errors,
    killSwitches,
    failedActions: failedActions.data || [],
    usageSummary: usageSummary.data || [],
    generatedAt: new Date().toISOString(),
  });
};

export default function AdminDebugPage() {
  const { errors, killSwitches, failedActions, usageSummary, generatedAt } = useLoaderData<typeof loader>();

  const switchColor = (active: boolean) => active ? '#EF4444' : '#10B981';
  const switchLabel = (active: boolean) => active ? '🔴 ACTIVE (blocking)' : '🟢 OFF (normal)';

  return (
    <div style={{ fontFamily: 'monospace', padding: '40px', maxWidth: '1200px', margin: '0 auto', background: '#0F172A', color: '#E2E8F0', minHeight: '100vh' }}>
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ color: '#F59E0B', fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>
          🔧 ANOTAI Admin Debug Console
        </h1>
        <p style={{ color: '#64748B', fontSize: '12px' }}>Generated: {new Date(generatedAt).toLocaleString()} · INTERNAL USE ONLY</p>
      </div>

      {/* Kill Switch Status */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ color: '#F59E0B', fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>⚠️ Global Kill Switches</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {Object.entries(killSwitches).map(([key, value]) => (
            <div key={key} style={{ background: '#1E293B', padding: '16px', borderRadius: '8px', borderLeft: `4px solid ${switchColor(value as boolean)}` }}>
              <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '4px' }}>{key}</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: switchColor(value as boolean) }}>{switchLabel(value as boolean)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Errors */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ color: '#EF4444', fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>🚨 Recent Errors ({errors.length})</h2>
        {errors.length === 0 ? (
          <p style={{ color: '#10B981' }}>✓ No recent errors.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#1E293B' }}>
                {['Time', 'Severity', 'Source', 'Event Type', 'Message', 'Resolved'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#94A3B8' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {errors.map((err: any) => (
                <tr key={err.id} style={{ borderBottom: '1px solid #1E293B' }}>
                  <td style={{ padding: '8px 12px', color: '#64748B' }}>{new Date(err.created_at).toLocaleTimeString()}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ color: err.severity === 'critical' ? '#EF4444' : err.severity === 'error' ? '#F59E0B' : '#94A3B8', fontWeight: 700 }}>
                      {err.severity?.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', color: '#94A3B8' }}>{err.source}</td>
                  <td style={{ padding: '8px 12px', color: '#94A3B8' }}>{err.event_type}</td>
                  <td style={{ padding: '8px 12px', color: '#E2E8F0', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{err.error_message}</td>
                  <td style={{ padding: '8px 12px' }}>{err.resolved_at ? <span style={{ color: '#10B981' }}>✓</span> : <span style={{ color: '#EF4444' }}>✗</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Failed Action Queue Items */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ color: '#F59E0B', fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>⚡ Failed Actions ({failedActions.length})</h2>
        {failedActions.length === 0 ? (
          <p style={{ color: '#10B981' }}>✓ No failed actions.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#1E293B' }}>
                {['Time', 'Action Type', 'Error'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#94A3B8' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {failedActions.map((a: any) => (
                <tr key={a.id} style={{ borderBottom: '1px solid #1E293B' }}>
                  <td style={{ padding: '8px 12px', color: '#64748B' }}>{new Date(a.created_at).toLocaleString()}</td>
                  <td style={{ padding: '8px 12px', color: '#E2E8F0' }}>{a.action_type}</td>
                  <td style={{ padding: '8px 12px', color: '#EF4444' }}>{a.error_message || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Usage Summary */}
      <section>
        <h2 style={{ color: '#10B981', fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>📊 Usage This Month</h2>
        {usageSummary.length === 0 ? (
          <p style={{ color: '#64748B' }}>No usage data this month.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#1E293B' }}>
                {['Store ID', 'AI Interactions', 'Recovery Emails', 'Est. Cost'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#94A3B8' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usageSummary.map((u: any) => (
                <tr key={u.store_id} style={{ borderBottom: '1px solid #1E293B' }}>
                  <td style={{ padding: '8px 12px', color: '#64748B' }}>{u.store_id?.substring(0, 8)}...</td>
                  <td style={{ padding: '8px 12px', color: '#E2E8F0' }}>{u.ai_interactions_used}</td>
                  <td style={{ padding: '8px 12px', color: '#E2E8F0' }}>{u.recovery_emails_sent}</td>
                  <td style={{ padding: '8px 12px', color: '#10B981' }}>${Number(u.estimated_ai_cost).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

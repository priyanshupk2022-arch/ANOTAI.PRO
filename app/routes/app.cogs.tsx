import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { bulkImportCOGS, getAllCOGS, upsertCOGS } from "~/agents/margin-guardian";
import { authenticate } from "~/shopify.server";
import { ensureStoreForSession } from "~/utils/store.server";
import "~/styles/dashboard.css";

type ActionResult = { success?: string; error?: string };

function parseCsvRows(csvText: string) {
  return csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(1)
    .map((line) => {
      const [product_id, variant_id, product_title, cogsValue] = line
        .split(",")
        .map((value) => value.trim());

      return {
        product_id,
        variant_id,
        product_title,
        cogs: Number(cogsValue),
      };
    })
    .filter(
      (row) =>
        row.product_id &&
        row.variant_id &&
        row.product_title &&
        Number.isFinite(row.cogs) &&
        row.cogs > 0
    );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await ensureStoreForSession(session).catch((error) => {
    console.warn("COGS store sync fallback used:", error);
    return null;
  });

  if (!store) {
    return json({
      cogsData: [],
      storeReady: false,
    });
  }

  const cogsData = await getAllCOGS(store.id).catch((error) => {
    console.warn("COGS data fallback used:", error);
    return [];
  });

  return json({
    cogsData,
    storeReady: true,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await ensureStoreForSession(session).catch((error) => {
    console.warn("COGS save blocked because store sync failed:", error);
    return null;
  });

  if (!store) {
    return json<ActionResult>(
      { error: "Store connection is not ready. Refresh after the tunnel/database is healthy." },
      { status: 503 }
    );
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "add_single") {
    const productId = String(formData.get("product_id") || "").trim();
    const variantId = String(formData.get("variant_id") || "").trim();
    const title = String(formData.get("product_title") || "").trim();
    const cogs = Number(formData.get("cogs"));

    if (!productId || !variantId || !title || !Number.isFinite(cogs) || cogs <= 0) {
      return json<ActionResult>(
        { error: "Product ID, Variant ID, Product Name, and a positive COGS value are required." },
        { status: 400 }
      );
    }

    const saved = await upsertCOGS(store.id, productId, variantId, title, cogs);
    if (!saved) {
      return json<ActionResult>({ error: "Product cost could not be saved." }, { status: 500 });
    }

    return json<ActionResult>({ success: "Product cost saved. Margin Guardian can now protect this variant." });
  }

  if (intent === "bulk_csv") {
    const csvText = String(formData.get("csv_data") || "");
    const rows = parseCsvRows(csvText);

    if (rows.length === 0) {
      return json<ActionResult>(
        { error: "No valid CSV rows found. Use: product_id, variant_id, product_title, cogs" },
        { status: 400 }
      );
    }

    const result = await bulkImportCOGS(store.id, rows);
    return json<ActionResult>({
      success: `Imported ${result.imported} products. ${result.errors} rows failed.`,
    });
  }

  return json<ActionResult>({ error: "Unknown action." }, { status: 400 });
};

export default function COGSManager() {
  const { cogsData, storeReady } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="dashboard-layout animate-fade-in">
      <nav className="sidebar">
        <div className="sidebar-brand">ANOTAI</div>
        <ul className="sidebar-nav">
          <li><a className="sidebar-item" href="/app"><span className="sidebar-item-icon">📊</span> Dashboard</a></li>
          <li><a className="sidebar-item active" href="/app/cogs"><span className="sidebar-item-icon">💰</span> COGS Manager</a></li>
          <li><a className="sidebar-item" href="/app/approvals"><span className="sidebar-item-icon">✅</span> Approvals</a></li>
          <li><a className="sidebar-item" href="/app/agents"><span className="sidebar-item-icon">🤖</span> AI Agents</a></li>
          <li><a className="sidebar-item" href="/app/analytics"><span className="sidebar-item-icon">📈</span> Analytics</a></li>
        </ul>
        <div className="sidebar-divider" />
        <div className="sidebar-label">System</div>
        <ul className="sidebar-nav">
          <li><a className="sidebar-item" href="/app/pixel"><span className="sidebar-item-icon">🛰️</span> Web Pixel</a></li>
          <li><a className="sidebar-item" href="/app/settings"><span className="sidebar-item-icon">⚙️</span> Settings</a></li>
        </ul>
      </nav>

      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">COGS Manager</h1>
          <p className="page-subtitle">
            Input your product costs. Margin Guardian uses this to block unsafe discounts and protect your profit.
          </p>
        </div>

        {!storeReady && (
          <div className="badge badge-warning" style={{ width: '100%', padding: '16px', marginBottom: '24px', borderRadius: '12px' }}>
            ⚠️ Store data is not connected. Database connection is required to save costs.
          </div>
        )}

        {actionData?.success && <div className="badge badge-success" style={{ width: '100%', padding: '16px', marginBottom: '24px', borderRadius: '12px' }}>{actionData.success}</div>}
        {actionData?.error && <div className="badge badge-error" style={{ width: '100%', padding: '16px', marginBottom: '24px', borderRadius: '12px' }}>{actionData.error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '40px' }}>
          <div className="card" style={{ marginBottom: 0 }}>
            <h2 className="section-title">💰 Add Product Cost</h2>
            <Form method="post" style={{ display: 'grid', gap: '16px' }}>
              <input type="hidden" name="intent" value="add_single" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <input name="product_id" placeholder="Product ID" required className="form-input" />
                <input name="variant_id" placeholder="Variant ID" required className="form-input" />
              </div>
              <input name="product_title" placeholder="Product Name (e.g. Classic White Tee)" required className="form-input" />
              <div style={{ display: 'flex', gap: '12px' }}>
                <input name="cogs" type="number" step="0.01" min="0.01" placeholder="Cost (USD)" required className="form-input" style={{ flex: 1 }} />
                <button type="submit" className="btn-primary">Save Cost</button>
              </div>
            </Form>
          </div>

          <div className="card" style={{ marginBottom: 0 }}>
            <h2 className="section-title">📄 Bulk CSV Import</h2>
            <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '16px' }}>
              Format: <code>product_id, variant_id, product_title, cogs</code>
            </p>
            <Form method="post">
              <input type="hidden" name="intent" value="bulk_csv" />
              <textarea
                name="csv_data"
                rows={4}
                placeholder={"12345, 67890, Classic Tee, 8.50\n12346, 67891, Leather Bag, 45.00"}
                className="form-input"
                style={{ fontFamily: 'monospace', resize: 'none' }}
              />
              <button type="submit" className="btn-primary" style={{ marginTop: '16px' }}>Import CSV</button>
            </Form>
          </div>
        </div>

        <div className="card">
          <h2 className="section-title">📦 Product Costs List ({cogsData.length})</h2>
          {cogsData.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state-icon">📋</span>
              <div className="empty-state-title">No costs added yet</div>
              <p className="empty-state-text">Add your first product cost above to enable Margin Guardian protection.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>COGS</th>
                    <th>Min. Safe Price</th>
                    <th>Margin Rule</th>
                  </tr>
                </thead>
                <tbody>
                  {cogsData.map((item: any) => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{item.product_title}</td>
                      <td>${Number(item.cogs).toFixed(2)}</td>
                      <td>
                        <span className="badge badge-success">${Number(item.min_price).toFixed(2)}</span>
                      </td>
                      <td>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary)' }}>20% FLOOR</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

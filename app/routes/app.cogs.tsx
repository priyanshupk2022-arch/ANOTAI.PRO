import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { bulkImportCOGS, getAllCOGS, upsertCOGS } from "~/agents/margin-guardian";
import { authenticate } from "~/shopify.server";
import { ensureStoreForSession } from "~/utils/store.server";
import { AppSidebar } from "~/components/AppSidebar";
import "~/styles/dashboard.css";

type ActionResult = { success?: string; error?: string };

function parseCsvRows(csvText: string) {
  const rows = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCsvLine)
    .filter((row) => row.some(Boolean));

  const dataRows = hasCsvHeader(rows[0]) ? rows.slice(1) : rows;
  const validRows = dataRows
    .map(([product_id, variant_id, product_title, cogsValue]) => {
      const cogs = Number(String(cogsValue || "").replace(/[$,]/g, ""));

      return {
        product_id: String(product_id || "").trim(),
        variant_id: String(variant_id || "").trim(),
        product_title: String(product_title || "").trim(),
        cogs,
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

  return {
    rows: validRows,
    skipped: dataRows.length - validRows.length,
  };
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function hasCsvHeader(row: string[] | undefined) {
  if (!row) return false;
  const normalized = row.map((value) => value.toLowerCase().replace(/[\s_-]/g, ""));
  return (
    normalized.includes("productid") &&
    normalized.includes("variantid") &&
    (normalized.includes("producttitle") || normalized.includes("productname")) &&
    normalized.includes("cogs")
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
    const parsed = parseCsvRows(csvText);

    if (parsed.rows.length === 0) {
      return json<ActionResult>(
        { error: "No valid CSV rows found. Use: product_id, variant_id, product_title, cogs" },
        { status: 400 }
      );
    }

    const result = await bulkImportCOGS(store.id, parsed.rows);
    return json<ActionResult>({
      success: `Imported ${result.imported} products. ${result.errors + parsed.skipped} rows skipped or failed.`,
    });
  }

  return json<ActionResult>({ error: "Unknown action." }, { status: 400 });
};

export default function COGSManager() {
  const { cogsData, storeReady } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="dashboard-layout">
      <AppSidebar active="cogs" />

      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">COGS Manager</h1>
          <p className="page-subtitle">
            Add product costs so Margin Guardian can block unsafe discounts and recovery offers.
          </p>
        </div>

        {!storeReady && (
          <div style={warningStyle}>
            Store data is not connected right now. You can view this page, but saving costs needs the
            database/tunnel connection to be healthy.
          </div>
        )}
        {actionData?.success && <div style={successStyle}>{actionData.success}</div>}
        {actionData?.error && <div style={errorStyle}>{actionData.error}</div>}

        <div className="card">
          <h2 className="section-title">Add Product Cost</h2>
          <Form method="post" style={formGridStyle}>
            <input type="hidden" name="intent" value="add_single" />
            <input name="product_id" placeholder="Product ID" required style={inputStyle} />
            <input name="variant_id" placeholder="Variant ID" required style={inputStyle} />
            <input name="product_title" placeholder="Product name" required style={{ ...inputStyle, gridColumn: "1 / -1" }} />
            <input name="cogs" type="number" step="0.01" min="0.01" placeholder="Cost in USD" required style={inputStyle} />
            <button type="submit" style={btnStyle}>Save Cost</button>
          </Form>
        </div>

        <div className="card">
          <h2 className="section-title">Bulk CSV Import</h2>
          <p style={helperTextStyle}>
            Use this format: <code style={codeStyle}>product_id, variant_id, product_title, cogs</code>
          </p>
          <Form method="post">
            <input type="hidden" name="intent" value="bulk_csv" />
            <textarea
              name="csv_data"
              rows={6}
              placeholder={"product_id, variant_id, product_title, cogs\n12345, 67890, Classic Tee, 8.50\n12346, 67891, Leather Bag, 45.00"}
              style={{ ...inputStyle, width: "100%", fontFamily: "monospace", fontSize: 13 }}
            />
            <button type="submit" style={{ ...btnStyle, marginTop: 12 }}>Import CSV</button>
          </Form>
        </div>

        <div className="card">
          <h2 className="section-title">Product Costs ({cogsData.length} products)</h2>
          {cogsData.length === 0 ? (
            <p style={{ color: "#94A3B8", fontSize: 14 }}>No product costs added yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #E2E8F0" }}>
                    <th style={thStyle}>Product</th>
                    <th style={thStyle}>COGS</th>
                    <th style={thStyle}>Minimum Safe Price</th>
                    <th style={thStyle}>Margin Rule</th>
                  </tr>
                </thead>
                <tbody>
                  {cogsData.map((item: any) => (
                    <tr key={item.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                      <td style={tdStyle}>{item.product_title}</td>
                      <td style={tdStyle}>${Number(item.cogs).toFixed(2)}</td>
                      <td style={tdStyle}>${Number(item.min_price).toFixed(2)}</td>
                      <td style={tdStyle}><span style={{ color: "#166534", fontWeight: 700 }}>20% floor</span></td>
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

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const inputStyle: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  fontSize: 14,
  fontFamily: "'DM Sans', sans-serif",
  outline: "none",
};

const btnStyle: React.CSSProperties = {
  padding: "10px 20px",
  background: "#0F172A",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif",
};

const helperTextStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#64748B",
  marginBottom: 12,
};

const codeStyle: React.CSSProperties = {
  background: "#F1F5F9",
  padding: "2px 6px",
  borderRadius: 4,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 14,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 12,
  fontWeight: 700,
  color: "#64748B",
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  color: "#1E293B",
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

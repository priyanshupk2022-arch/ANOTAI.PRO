import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { getWebPixelScript } from "~/services/web-pixel.server";
import { authenticate } from "~/shopify.server";
import "~/styles/dashboard.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const appUrl = process.env.SHOPIFY_APP_URL || "https://example.com";
  const pixelScript = getWebPixelScript(appUrl, session.shop);

  return json({
    pixelScript,
    shop: session.shop,
    appUrl,
  });
};

export default function PixelSetup() {
  const { pixelScript, appUrl } = useLoaderData<typeof loader>();
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(pixelScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="dashboard-layout">
      <nav className="sidebar">
        <div className="sidebar-brand">ANOTAI</div>
        <ul className="sidebar-nav">
          <li><a className="sidebar-item" href="/app"><span className="sidebar-item-icon">DB</span> Dashboard</a></li>
          <li><a className="sidebar-item" href="/app/cogs"><span className="sidebar-item-icon">MG</span> COGS Manager</a></li>
          <li><a className="sidebar-item" href="/app/agents"><span className="sidebar-item-icon">AI</span> Agents</a></li>
          <li><a className="sidebar-item" href="/app/analytics"><span className="sidebar-item-icon">RA</span> Analytics</a></li>
        </ul>
        <div className="sidebar-divider" />
        <div className="sidebar-label">Setup</div>
        <ul className="sidebar-nav">
          <li><a className="sidebar-item active" href="/app/pixel"><span className="sidebar-item-icon">PX</span> Web Pixel</a></li>
          <li><a className="sidebar-item" href="/app/settings"><span className="sidebar-item-icon">ST</span> Settings</a></li>
        </ul>
      </nav>

      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Web Pixel Setup</h1>
          <p className="page-subtitle">
            Install this customer event pixel so Retention Engine can learn search and product intent.
          </p>
        </div>

        <div className="card">
          <h2 className="section-title">Install Steps</h2>
          <div style={stepsStyle}>
            <Step number="1" title="Open Customer Events" text="In Shopify Admin, go to Settings, then Customer events." />
            <Step number="2" title="Add a custom pixel" text="Create a pixel named ANOTAI Intent Tracker." />
            <Step number="3" title="Paste and connect" text="Paste the code below, save it, then connect the pixel." />
          </div>
        </div>

        <div className="card">
          <div style={codeHeaderStyle}>
            <div>
              <h2 className="section-title" style={{ marginBottom: 4 }}>Pixel Code</h2>
              <p style={smallTextStyle}>Endpoint: {appUrl}</p>
            </div>
            <button onClick={copyToClipboard} style={copyButtonStyle}>
              {copied ? "Copied" : "Copy Code"}
            </button>
          </div>
          <pre style={preStyle}>{pixelScript}</pre>
        </div>

        <div className="card">
          <h2 className="section-title">What It Tracks</h2>
          <div style={trackingGridStyle}>
            <TrackCard title="Search queries" text="Captures what shoppers search for when they are interested but not ready to buy." />
            <TrackCard title="Product views" text="Turns product browsing into retention signals for future campaigns." />
            <TrackCard title="Privacy-safe default" text="Only useful customer signals are sent, and the storefront never breaks if ANOTAI is offline." />
          </div>
        </div>
      </main>
    </div>
  );
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div style={stepStyle}>
      <div style={stepNum}>{number}</div>
      <div>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>{title}</div>
        <div style={smallTextStyle}>{text}</div>
      </div>
    </div>
  );
}

function TrackCard({ title, text }: { title: string; text: string }) {
  return (
    <div style={trackCardStyle}>
      <strong style={{ color: "#0F172A" }}>{title}</strong>
      <p style={{ ...smallTextStyle, marginTop: 6 }}>{text}</p>
    </div>
  );
}

const stepsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

const stepStyle: React.CSSProperties = {
  display: "flex",
  gap: 14,
  alignItems: "flex-start",
};

const stepNum: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  background: "#0F172A",
  color: "#FFFFFF",
  display: "grid",
  placeItems: "center",
  fontSize: 13,
  fontWeight: 900,
  flexShrink: 0,
};

const codeHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  marginBottom: 12,
};

const copyButtonStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "#0F172A",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif",
};

const preStyle: React.CSSProperties = {
  background: "#0F172A",
  color: "#E2E8F0",
  padding: 20,
  borderRadius: 8,
  fontSize: 12,
  lineHeight: 1.6,
  overflow: "auto",
  maxHeight: 430,
  whiteSpace: "pre-wrap",
};

const trackingGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const trackCardStyle: React.CSSProperties = {
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: 14,
};

const smallTextStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#64748B",
  lineHeight: 1.5,
};

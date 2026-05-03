import "~/styles/dashboard.css";

const agents = [
  { name: "Margin Guardian", metric: "3", label: "unsafe offers blocked" },
  { name: "Cart Sniper", metric: "$1.8k", label: "cart recovery impact" },
  { name: "AI Personal Shopper", metric: "22%", label: "bundle acceptance" },
  { name: "Retention Engine", metric: "18", label: "intent signals" },
  { name: "Revenue Analyst", metric: "Ready", label: "operator report" },
];

const activity = [
  "Margin Guardian blocked unsafe 25% discount",
  "Cart Sniper queued a recovery offer for owner approval",
  "Cart Sniper recovered $1,842 from one abandoned cart",
  "Retention Engine captured a search intent signal",
  "AI Personal Shopper generated a bundle worth $626",
  "Revenue Analyst prepared today operator report",
];

export default function DemoPage() {
  return (
    <div className="dashboard-layout">
      <nav className="sidebar">
        <div className="sidebar-brand">ANOTAI</div>
        <ul className="sidebar-nav">
          <li><a className="sidebar-item active" href="/demo"><span className="sidebar-item-icon">DB</span> Demo</a></li>
          <li><a className="sidebar-item" href="/privacy"><span className="sidebar-item-icon">PR</span> Privacy</a></li>
          <li><a className="sidebar-item" href="/terms"><span className="sidebar-item-icon">TM</span> Terms</a></li>
          <li><a className="sidebar-item" href="/support"><span className="sidebar-item-icon">HP</span> Support</a></li>
        </ul>
        <div className="sidebar-divider" />
        <div className="sidebar-label">Shopify app</div>
        <ul className="sidebar-nav">
          <li><a className="sidebar-item" href="/app"><span className="sidebar-item-icon">IN</span> Open Installed App</a></li>
        </ul>
      </nav>

      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">ANOTAI Beta Demo</h1>
            <p className="page-subtitle">
              Public demo mode for showing the MVP without Shopify login. Real store data appears after app install.
            </p>
          </div>
          <span className="beta-pill">Demo Mode</span>
        </div>

        <div className="beta-readiness">
          <div>
            <span className="readiness-label">Paid beta setup</span>
            <strong>Approval-first AI team</strong>
            <p>Use this screen to explain the product before installing it on a real Shopify store.</p>
          </div>
          <a href="/">Install on Shopify</a>
        </div>

        <div className="hero-metric">
          <div className="hero-label">Potential Revenue Impact</div>
          <div className="hero-value">$2,468</div>
          <span className="hero-trend">Sample beta store snapshot</span>
        </div>

        <div className="ops-grid">
          <div className="ops-card">
            <div className="ops-card-header">
              <span>Customer Signals</span>
              <strong>Demo</strong>
            </div>
            <div className="signal-grid">
              <Signal label="Customers known" value="3" />
              <Signal label="Search intents" value="18" />
              <Signal label="Abandoned carts" value="7" />
              <Signal label="Recovered carts" value="2" />
            </div>
          </div>

          <div className="ops-card">
            <div className="ops-card-header">
              <span>Worker Health</span>
              <strong>Ready</strong>
            </div>
            <div className="signal-grid">
              <Signal label="Pending jobs" value="1" />
              <Signal label="Processing" value="0" />
              <Signal label="Done today" value="14" />
              <Signal label="Failed" value="0" />
            </div>
          </div>
        </div>

        <div className="agents-grid">
          {agents.map((agent) => (
            <div className="agent-card" key={agent.name}>
              <div className="agent-card-header">
                <span className="agent-card-emoji">AI</span>
                <span className="agent-card-name">{agent.name}</span>
                <div className="agent-card-status" />
              </div>
              <div className="agent-card-metric">{agent.metric}</div>
              <div className="agent-card-label">{agent.label}</div>
            </div>
          ))}
        </div>

        <div className="feed-section">
          <h2 className="section-title">What the live app will show</h2>
          <div className="feed-list">
            {activity.map((item) => (
              <div className="feed-item" key={item}>
                <div className="feed-dot" />
                <span className="feed-text">{item}</span>
                <span className="feed-time">example</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="section-title">Next live step</h2>
          <p style={bodyTextStyle}>
            Enter a Shopify store domain on the landing page, install ANOTAI, then open the embedded app inside Shopify Admin.
            In the installed app, use Load sample data once to show the same kind of rich dashboard with live database rows.
          </p>
        </div>
      </main>
    </div>
  );
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <div className="signal-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const bodyTextStyle: React.CSSProperties = {
  color: "#64748B",
  fontSize: 14,
  lineHeight: 1.6,
  margin: 0,
};

import { Link } from "@remix-run/react";

type AppSidebarKey =
  | "dashboard"
  | "onboarding"
  | "approvals"
  | "cogs"
  | "agents"
  | "analytics"
  | "billing"
  | "pixel"
  | "settings";

const primaryLinks: Array<{ key: AppSidebarKey; href: string; icon: string; label: string }> = [
  { key: "dashboard", href: "/app", icon: "DB", label: "Dashboard" },
  { key: "onboarding", href: "/app/onboarding", icon: "GO", label: "Onboarding" },
  { key: "approvals", href: "/app/approvals", icon: "OK", label: "Approvals" },
  { key: "cogs", href: "/app/cogs", icon: "MG", label: "COGS Manager" },
  { key: "agents", href: "/app/agents", icon: "AI", label: "Agents" },
  { key: "analytics", href: "/app/analytics", icon: "RA", label: "Analytics" },
  { key: "billing", href: "/app/billing", icon: "BP", label: "Beta Plan" },
];

const setupLinks: Array<{ key: AppSidebarKey; href: string; icon: string; label: string }> = [
  { key: "pixel", href: "/app/pixel", icon: "PX", label: "Web Pixel" },
  { key: "settings", href: "/app/settings", icon: "ST", label: "Settings" },
];

export function AppSidebar({ active }: { active: AppSidebarKey }) {
  return (
    <nav className="sidebar">
      <div className="sidebar-brand">ANOTAI</div>
      <ul className="sidebar-nav">
        {primaryLinks.map((link) => (
          <li key={link.key}>
            <Link className={sidebarItemClass(active, link.key)} to={link.href}>
              <span className="sidebar-item-icon">{link.icon}</span> {link.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="sidebar-divider" />
      <div className="sidebar-label">Setup</div>
      <ul className="sidebar-nav">
        {setupLinks.map((link) => (
          <li key={link.key}>
            <Link className={sidebarItemClass(active, link.key)} to={link.href}>
              <span className="sidebar-item-icon">{link.icon}</span> {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function sidebarItemClass(active: AppSidebarKey, key: AppSidebarKey) {
  return active === key ? "sidebar-item active" : "sidebar-item";
}

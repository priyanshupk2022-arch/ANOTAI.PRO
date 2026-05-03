import { Link } from "@remix-run/react";

type LegalSection = {
  title: string;
  text: string;
};

export function LegalPage({
  title,
  updated,
  eyebrow,
  intro,
  sections,
  children,
}: {
  title: string;
  updated: string;
  eyebrow: string;
  intro: string;
  sections: LegalSection[];
  children?: React.ReactNode;
}) {
  return (
    <main style={pageStyle}>
      <nav style={navStyle}>
        <Link to="/" style={brandStyle}>ANOTAI</Link>
        <div style={navLinksStyle}>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/support">Support</Link>
        </div>
      </nav>

      <section style={heroStyle}>
        <span style={eyebrowStyle}>{eyebrow}</span>
        <h1 style={titleStyle}>{title}</h1>
        <p style={introStyle}>{intro}</p>
        <p style={updatedStyle}>Last updated: {updated}</p>
      </section>

      <section style={contentStyle}>
        <div style={sectionListStyle}>
          {sections.map((section) => (
            <article style={sectionStyle} key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.text}</p>
            </article>
          ))}
        </div>
        {children}
      </section>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "linear-gradient(135deg, rgba(37, 99, 235, 0.05) 0 1px, transparent 1px 40px), #F7F9F4",
  color: "#0F172A",
  fontFamily: "'DM Sans', system-ui, sans-serif",
  padding: 28,
};

const navStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  maxWidth: 980,
  margin: "0 auto 26px",
};

const brandStyle: React.CSSProperties = {
  color: "#0F172A",
  textDecoration: "none",
  fontSize: 17,
  fontWeight: 1000,
  letterSpacing: 0.8,
};

const navLinksStyle: React.CSSProperties = {
  display: "flex",
  gap: 16,
  fontSize: 13,
  fontWeight: 900,
};

const heroStyle: React.CSSProperties = {
  maxWidth: 980,
  margin: "0 auto 18px",
  padding: 30,
  borderRadius: 8,
  background: "#0F172A",
  color: "#FFFFFF",
  boxShadow: "0 18px 50px rgba(15, 23, 42, 0.14)",
};

const eyebrowStyle: React.CSSProperties = {
  color: "#A7F3D0",
  fontSize: 11,
  fontWeight: 1000,
  textTransform: "uppercase",
  letterSpacing: 0.9,
};

const titleStyle: React.CSSProperties = {
  margin: "10px 0 12px",
  fontSize: 44,
  lineHeight: 1,
  letterSpacing: 0,
};

const introStyle: React.CSSProperties = {
  maxWidth: 760,
  margin: 0,
  color: "#CBD5E1",
  fontSize: 16,
  lineHeight: 1.6,
  fontWeight: 650,
};

const updatedStyle: React.CSSProperties = {
  margin: "18px 0 0",
  color: "#A7F3D0",
  fontSize: 12,
  fontWeight: 900,
};

const contentStyle: React.CSSProperties = {
  maxWidth: 980,
  margin: "0 auto",
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: 24,
};

const sectionListStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
};

const sectionStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 8,
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  color: "#334155",
  fontSize: 14,
  lineHeight: 1.55,
};

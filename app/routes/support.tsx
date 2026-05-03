import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { LegalPage } from "~/components/LegalPage";

const supportItems = [
  {
    title: "Founder-led onboarding",
    text: "Early merchants get help connecting the app, loading COGS data, keeping agents approval-first, and reviewing the first revenue actions.",
  },
  {
    title: "What to include",
    text: "Send your Shopify store domain, the page where the issue happened, what you clicked, and what you expected to happen.",
  },
  {
    title: "Beta response scope",
    text: "Support focuses on app access, billing test flow, COGS setup, approvals, demo data, and core cart-recovery workflow reliability.",
  },
];

export const loader = async () => {
  return json({
    supportEmail:
      process.env.ANOTAI_SUPPORT_EMAIL ||
      process.env.SUPPORT_EMAIL ||
      "support@anotai.app",
  });
};

export default function SupportPage() {
  const { supportEmail } = useLoaderData<typeof loader>();

  return (
    <LegalPage
      eyebrow="Founder support"
      title="Support"
      updated="April 30, 2026"
      intro="ANOTAI beta support is intentionally direct and hands-on while the product is being prepared for public launch."
      sections={supportItems}
    >
      <div style={contactBoxStyle}>
        <strong>Support email</strong>
        <a href={`mailto:${supportEmail}`} style={supportEmailStyle}>{supportEmail}</a>
      </div>
    </LegalPage>
  );
}

const contactBoxStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  marginTop: 16,
  padding: 18,
  borderRadius: 8,
  background: "#ECFDF5",
  color: "#166534",
  border: "1px solid #86EFAC",
};

const supportEmailStyle: React.CSSProperties = {
  color: "#166534",
  fontSize: 16,
  fontWeight: 1000,
  textDecoration: "none",
};

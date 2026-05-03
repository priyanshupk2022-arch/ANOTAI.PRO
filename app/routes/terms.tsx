import { LegalPage } from "~/components/LegalPage";

const sections = [
  {
    title: "Private beta service",
    text: "ANOTAI is currently a private beta Shopify app for selected merchants. Features, limits, and workflows may change as we improve reliability and collect feedback.",
  },
  {
    title: "Approval-first automation",
    text: "Customer-facing emails, discounts, and high-impact campaigns should stay in owner approval mode during beta unless the merchant intentionally enables stronger automation.",
  },
  {
    title: "Merchant responsibility",
    text: "The merchant is responsible for reviewing approvals, validating offers, maintaining accurate COGS data, and ensuring store policies and customer promises remain accurate.",
  },
  {
    title: "No guaranteed revenue",
    text: "ANOTAI is designed to find revenue opportunities and protect margins, but it does not guarantee sales, profit, conversion lift, or specific business outcomes.",
  },
  {
    title: "Usage limits",
    text: "Beta plans may include limits on AI actions, customer events, emails, background jobs, and support scope to keep service quality stable for early merchants.",
  },
  {
    title: "Billing",
    text: "Paid beta billing uses Shopify-native app subscriptions where required. Test charges should be used only on development stores until live onboarding is ready.",
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Private beta terms"
      title="Terms of Service"
      updated="April 30, 2026"
      intro="These terms set clear expectations for early ANOTAI merchants before public launch and formal legal review."
      sections={sections}
    />
  );
}

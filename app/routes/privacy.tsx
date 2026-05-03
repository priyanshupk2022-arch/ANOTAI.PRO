import { LegalPage } from "~/components/LegalPage";

const sections = [
  {
    title: "Data we collect",
    text: "ANOTAI stores merchant app settings, Shopify store domain, product cost records, agent activity, approval decisions, cart recovery signals, customer intent signals, and email event logs needed to run the app.",
  },
  {
    title: "How we use data",
    text: "Data is used only to power merchant-owned revenue workflows: margin protection, abandoned-cart recovery, customer retention, approval queues, reporting, support, and app security.",
  },
  {
    title: "Customer data",
    text: "Customer signals are used to help the merchant serve their own customers. ANOTAI does not sell customer personal data or use it for third-party advertising marketplaces.",
  },
  {
    title: "Security",
    text: "Private keys stay on the server. Shopify access tokens, OpenAI keys, Resend keys, and Supabase service role keys are never exposed to the browser bundle.",
  },
  {
    title: "Store isolation",
    text: "Each merchant's data is scoped to that merchant's Shopify store. One merchant cannot access another merchant's customers, events, costs, or reports.",
  },
  {
    title: "Deletion and privacy webhooks",
    text: "ANOTAI implements Shopify privacy webhooks for customer data requests, customer redaction, and shop redaction. Store-linked app data is deleted or anonymized when required.",
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy and data use"
      title="Privacy Policy"
      updated="April 30, 2026"
      intro="Plain-English privacy terms for ANOTAI private beta merchants and Shopify review. This page will be reviewed again before public App Store launch."
      sections={sections}
    />
  );
}

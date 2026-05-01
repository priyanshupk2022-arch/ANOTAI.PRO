import "~/styles/dashboard.css";

export default function TermsPage() {
  return (
    <div className="dashboard-layout animate-fade-in" style={{ padding: '40px' }}>
      <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h1 className="page-title">Terms of Service</h1>
        <p className="page-subtitle">Last updated: May 01, 2026</p>
        
        <div className="feed-list" style={{ marginTop: '32px' }}>
          <section style={{ marginBottom: '24px' }}>
            <h2 className="section-title">1. Service Overview</h2>
            <p style={{ color: 'var(--gray-600)', lineHeight: 1.6 }}>
              ANOTAI provides autonomous AI agents for Shopify stores. By using this service, you agree to allow AI to interact with your customers based on the Playbook settings you provide.
            </p>
          </section>

          <section style={{ marginBottom: '24px' }}>
            <h2 className="section-title">2. Billing</h2>
            <p style={{ color: 'var(--gray-600)', lineHeight: 1.6 }}>
              The Pro Plan is billed monthly via Shopify. Cancellations can be made at any time through the Shopify Admin.
            </p>
          </section>

          <section style={{ marginBottom: '24px' }}>
            <h2 className="section-title">3. Liability</h2>
            <p style={{ color: 'var(--gray-600)', lineHeight: 1.6 }}>
              While we use strict safety guardrails, ANOTAI is not liable for medical advice or results promised by the AI. Merchants are responsible for reviewing AI recommendations in "Approval Mode".
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

import "~/styles/dashboard.css";

export default function PrivacyPage() {
  return (
    <div className="dashboard-layout animate-fade-in" style={{ padding: '40px' }}>
      <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h1 className="page-title">Privacy Policy</h1>
        <p className="page-subtitle">Last updated: May 01, 2026</p>
        
        <div className="feed-list" style={{ marginTop: '32px' }}>
          <section style={{ marginBottom: '24px' }}>
            <h2 className="section-title">1. Information We Collect</h2>
            <p style={{ color: 'var(--gray-600)', lineHeight: 1.6 }}>
              ANOTAI collects store data (products, orders, and customer search intent) to provide AI-driven skincare advice and abandoned cart recovery. We do not sell your data to third parties.
            </p>
          </section>

          <section style={{ marginBottom: '24px' }}>
            <h2 className="section-title">2. How We Use Data</h2>
            <p style={{ color: 'var(--gray-600)', lineHeight: 1.6 }}>
              Data is used strictly to train the AI Personal Shopper on your brand voice and to validate discounts via Margin Guardian.
            </p>
          </section>

          <section style={{ marginBottom: '24px' }}>
            <h2 className="section-title">3. GDPR Compliance</h2>
            <p style={{ color: 'var(--gray-600)', lineHeight: 1.6 }}>
              We support mandatory GDPR webhooks for data deletion and access requests. Please contact support@anotai.com for any data concerns.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

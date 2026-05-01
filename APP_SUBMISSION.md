# ANOTAI: Shopify App Review Guide

Welcome, Shopify Reviewer! ANOTAI is an AI-powered revenue automation assistant specialized for Beauty and Skincare brands.

## 🛠️ Step-by-Step Testing Plan

### 1. Installation & Onboarding
- Install the app and you will be directed to the **AI Playbook Onboarding**.
- Complete the 7-step wizard (Select Skincare niche, Professional voice, etc.).
- Verify that your settings are saved in the **Settings** tab.

### 2. Storefront Chat Widget (The "Pillar")
- Go to your Online Store -> Themes -> Customize.
- Add the **ANOTAI Chat Widget** App Block to your theme (usually in the Footer or body).
- Visit your storefront and click the floating "Expert Advice" bubble.
- Type a skincare question (e.g., *"My skin is dry, what do you recommend?"*).
- Verify the AI responds with advice and product recommendations.

### 3. Margin Guardian (Safety Check)
- Go to the **COGS Manager** in the app.
- Set a "Minimum Price" for a product.
- Go back to the Chat Widget and ask for a 90% discount.
- Verify that the AI/Margin Guardian caps the discount to your safety floor.

### 4. Billing Verification
- Navigate to the **Settings** or **Billing** page.
- You should see the **Pro Plan ($49/mo)** option.
- Accept the test charge to verify the Shopify Billing API integration.

### 5. GDPR Compliance
- Our app supports the mandatory GDPR webhooks.
- Data deletion endpoints are located at `/webhooks/customers/redact` and `/webhooks/shop/redact`.

---
*For any issues during review, please contact dev@anotai.app.*

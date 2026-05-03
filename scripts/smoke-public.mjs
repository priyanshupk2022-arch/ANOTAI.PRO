const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";

const checks = [
  {
    path: "/demo",
    expected: ["ANOTAI", "$2,468", "Sample beta store snapshot"],
  },
  {
    path: "/privacy",
    expected: ["ANOTAI", "Privacy Policy", "Shopify"],
  },
  {
    path: "/terms",
    expected: ["ANOTAI", "Terms of Service", "Shopify"],
  },
  {
    path: "/support",
    expected: ["ANOTAI", "Founder-led onboarding", "Support"],
  },
];

for (const check of checks) {
  const url = new URL(check.path, baseUrl).toString();
  const response = await fetch(url, { redirect: "manual" });

  if (!response.ok) {
    throw new Error(`${check.path} returned HTTP ${response.status}`);
  }

  const body = await response.text();
  const missing = check.expected.filter((text) => !body.includes(text));

  if (missing.length > 0) {
    throw new Error(`${check.path} is missing expected text: ${missing.join(", ")}`);
  }

  console.log(`ok ${check.path}`);
}

export type AgentName =
  | "margin_guardian"
  | "personal_shopper"
  | "cart_sniper"
  | "retention_engine"
  | "revenue_analyst";

export type AgentMode = "approval" | "auto" | "locked";

export type AgentProfile = {
  name: AgentName;
  displayName: string;
  initials: string;
  description: string;
  mission: string;
  inputs: string[];
  outputs: string[];
  autoAllowed: string;
  approvalRequired: string;
};

export type OwnerSafetySettings = {
  minMarginPct: number;
  maxDiscountPct: number;
  dailyEmailLimit: number;
  autoRevenueLimit: number;
  approvalRequiredAboveDiscountPct: number;
};

export type StorePlaybook = {
  niche: string;
  brandVoice: string;
  targetRevenueRange: string;
  bestsellerCategories: string[];
  shopperMode: "beauty_skincare";
  approvedClaims: string[];
  forbiddenClaims: string[];
  defaultRoutineSteps: string[];
};

export type OwnerControls = {
  agentModes: Record<AgentName, AgentMode>;
  safety: OwnerSafetySettings;
  playbook: StorePlaybook;
};

export const AGENT_PROFILES: AgentProfile[] = [
  {
    name: "margin_guardian",
    displayName: "Margin Guardian",
    initials: "MG",
    description: "Protects every sale from margin leaks and unsafe discounts.",
    mission: "Act as the financial firewall before discounts, bundles, and recovery offers go live.",
    inputs: ["COGS", "current price", "requested discount", "cart products"],
    outputs: ["approve", "block", "max safe discount", "margin warning"],
    autoAllowed: "Run safety checks and block unsafe offers automatically.",
    approvalRequired: "Owner approval is required before changing global margin rules.",
  },
  {
    name: "cart_sniper",
    displayName: "Cart Sniper",
    initials: "CS",
    description: "Recovers abandoned carts with controlled follow-up offers.",
    mission: "Bring back shoppers who abandoned checkout without giving away profit.",
    inputs: ["cart items", "customer email", "abandonment time", "safe discount result"],
    outputs: ["recovery offer", "pending approval", "blocked recovery", "recovered revenue log"],
    autoAllowed: "Send recovery offers only when discount and value limits are safe.",
    approvalRequired: "Approval is required when discount size or cart value crosses owner limits.",
  },
  {
    name: "personal_shopper",
    displayName: "AI Personal Shopper",
    initials: "AI",
    description: "Guides skincare shoppers to safe routines, alternatives, and margin-safe bundles.",
    mission: "Help beauty customers find the right in-stock routine without unsafe skincare claims.",
    inputs: ["skin concern", "skin type", "budget", "sensitivity", "catalog", "approved claims", "margin check"],
    outputs: ["routine suggestion", "in-stock alternative", "safe bundle", "approval request"],
    autoAllowed: "Show non-discount skincare guidance and in-stock alternatives using approved product facts.",
    approvalRequired: "Approval is required before discount-led bundles or customer-facing claims outside approved copy.",
  },
  {
    name: "retention_engine",
    displayName: "Retention Engine",
    initials: "RE",
    description: "Turns customer intent into repeat purchases.",
    mission: "Use search and product interest to bring customers back later.",
    inputs: ["search query", "product views", "customer email", "new product data"],
    outputs: ["intent capture", "matched audience", "VIP drop draft", "email send log"],
    autoAllowed: "Capture intent signals and queue safe targeted follow-ups.",
    approvalRequired: "Approval is required before bulk email campaigns or high-volume sends.",
  },
  {
    name: "revenue_analyst",
    displayName: "Revenue Analyst",
    initials: "RA",
    description: "Explains what the AI team did and what to do next.",
    mission: "Give the founder a simple operator report across all agents.",
    inputs: ["agent actions", "revenue impact", "margin events", "intent data"],
    outputs: ["daily report", "next best action", "risk summary", "ROI summary"],
    autoAllowed: "Generate reports and recommendations automatically.",
    approvalRequired: "Approval is required before asking other agents to execute campaigns.",
  },
];

export const DEFAULT_OWNER_CONTROLS: OwnerControls = {
  agentModes: {
    margin_guardian: "auto",
    cart_sniper: "approval",
    personal_shopper: "approval",
    retention_engine: "approval",
    revenue_analyst: "auto",
  },
  safety: {
    minMarginPct: 20,
    maxDiscountPct: 15,
    dailyEmailLimit: 50,
    autoRevenueLimit: 100,
    approvalRequiredAboveDiscountPct: 10,
  },
  playbook: {
    niche: "beauty_skincare",
    brandVoice: "expert, friendly, clear, confidence-building",
    targetRevenueRange: "$50k-$500k/month US Shopify beauty stores",
    bestsellerCategories: ["cleanser", "serum", "moisturizer", "sunscreen"],
    shopperMode: "beauty_skincare",
    approvedClaims: [
      "hydrates",
      "supports a smoother-looking routine",
      "helps skin feel refreshed",
      "supports the look of more even tone",
      "suitable for the listed skin type when product data says so",
    ],
    forbiddenClaims: [
      "guaranteed fairness",
      "skin whitening guarantee",
      "medical diagnosis",
      "cures acne",
      "doctor recommended unless verified",
      "fake urgency",
      "fake reviews",
    ],
    defaultRoutineSteps: ["cleanser", "serum", "moisturizer", "sunscreen"],
  },
};

export function getAgentProfile(agentName: AgentName) {
  return AGENT_PROFILES.find((profile) => profile.name === agentName);
}

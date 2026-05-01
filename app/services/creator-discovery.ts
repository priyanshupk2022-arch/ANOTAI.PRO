/**
 * 🔍 CREATOR DISCOVERY SERVICE — Mock API for Micro-Influencers
 * 
 * Simulates fetching micro-creators (10K-50K followers) based on
 * product keywords. In production, this would connect to Instagram API,
 * TikTok Creator Marketplace, or a service like Modash/Upfluence.
 */

export interface Creator {
  id: string;
  name: string;
  handle: string;
  platform: "instagram" | "tiktok" | "youtube";
  followers: number;
  engagement_rate: number; // percentage (e.g., 4.5 = 4.5%)
  niche: string[];
  email: string;
  avg_views: number;
  location: string;
  score: number; // Internal fit score 0-100
}

// ─── Mock Creator Database ───────────────────────────────
const MOCK_CREATORS: Creator[] = [
  {
    id: "cr_001", name: "Priya Fitness", handle: "@priyafitlife", platform: "instagram",
    followers: 28000, engagement_rate: 5.2, niche: ["fitness", "activewear", "health"],
    email: "priya.fit@creator.io", avg_views: 8400, location: "US", score: 0,
  },
  {
    id: "cr_002", name: "Jake Styles", handle: "@jakestylesco", platform: "tiktok",
    followers: 42000, engagement_rate: 7.1, niche: ["fashion", "streetwear", "sneakers"],
    email: "jake@stylesco.com", avg_views: 15000, location: "US", score: 0,
  },
  {
    id: "cr_003", name: "Sara Beauty", handle: "@sarabeautylab", platform: "instagram",
    followers: 18000, engagement_rate: 6.3, niche: ["beauty", "skincare", "cosmetics"],
    email: "sara@beautylab.co", avg_views: 5400, location: "UK", score: 0,
  },
  {
    id: "cr_004", name: "TechMike", handle: "@techmikereview", platform: "youtube",
    followers: 35000, engagement_rate: 3.8, niche: ["tech", "gadgets", "electronics"],
    email: "mike@techreviews.io", avg_views: 12000, location: "US", score: 0,
  },
  {
    id: "cr_005", name: "Outdoor Alex", handle: "@alexoutdoors", platform: "tiktok",
    followers: 22000, engagement_rate: 8.5, niche: ["outdoor", "camping", "adventure", "sports"],
    email: "alex@outdooradv.com", avg_views: 9500, location: "CA", score: 0,
  },
  {
    id: "cr_006", name: "Home by Nina", handle: "@homebynina", platform: "instagram",
    followers: 31000, engagement_rate: 4.9, niche: ["home", "decor", "lifestyle", "kitchen"],
    email: "nina@homebynina.co", avg_views: 7800, location: "US", score: 0,
  },
  {
    id: "cr_007", name: "FitFood Dan", handle: "@fitfooddan", platform: "tiktok",
    followers: 47000, engagement_rate: 6.7, niche: ["food", "health", "fitness", "nutrition"],
    email: "dan@fitfood.io", avg_views: 18000, location: "US", score: 0,
  },
  {
    id: "cr_008", name: "Pet Life Mia", handle: "@petlifemia", platform: "instagram",
    followers: 14000, engagement_rate: 9.2, niche: ["pets", "dogs", "animals"],
    email: "mia@petlife.co", avg_views: 4200, location: "AU", score: 0,
  },
  {
    id: "cr_009", name: "Minimal Josh", handle: "@minimaljosh", platform: "youtube",
    followers: 38000, engagement_rate: 4.1, niche: ["minimalism", "lifestyle", "fashion", "accessories"],
    email: "josh@minimalstyle.co", avg_views: 11000, location: "US", score: 0,
  },
  {
    id: "cr_010", name: "GlowUp Zara", handle: "@glowupzara", platform: "tiktok",
    followers: 50000, engagement_rate: 7.8, niche: ["beauty", "fashion", "lifestyle", "skincare"],
    email: "zara@glowup.style", avg_views: 22000, location: "UK", score: 0,
  },
];

/**
 * Discover micro-creators that match product keywords.
 * Scores creators based on niche relevance, engagement rate, and follower count.
 * Returns top matches sorted by fit score.
 */
export async function discoverCreators(
  keywords: string[],
  options?: {
    min_followers?: number;
    max_followers?: number;
    min_engagement?: number;
    platform?: "instagram" | "tiktok" | "youtube";
    limit?: number;
  }
): Promise<Creator[]> {
  const minFollowers = options?.min_followers || 10000;
  const maxFollowers = options?.max_followers || 50000;
  const minEngagement = options?.min_engagement || 3.0;
  const limit = options?.limit || 5;

  // Simulate API latency
  await new Promise((resolve) => setTimeout(resolve, 200));

  const loweredKeywords = keywords.map((k) => k.toLowerCase());

  const scored = MOCK_CREATORS
    .filter((c) => {
      if (c.followers < minFollowers || c.followers > maxFollowers) return false;
      if (c.engagement_rate < minEngagement) return false;
      if (options?.platform && c.platform !== options.platform) return false;
      return true;
    })
    .map((creator) => {
      // Calculate fit score based on niche overlap + engagement
      const nicheOverlap = creator.niche.filter((n) =>
        loweredKeywords.some((k) => n.includes(k) || k.includes(n))
      ).length;

      const nicheScore = Math.min((nicheOverlap / Math.max(loweredKeywords.length, 1)) * 50, 50);
      const engagementScore = Math.min(creator.engagement_rate * 5, 30);
      const followerScore = Math.min((creator.followers / maxFollowers) * 20, 20);

      return {
        ...creator,
        score: Math.round(nicheScore + engagementScore + followerScore),
      };
    })
    .filter((c) => c.score > 15) // Minimum relevance threshold
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

/**
 * Get a single creator by ID (for tracking/reporting).
 */
export async function getCreatorById(creatorId: string): Promise<Creator | null> {
  return MOCK_CREATORS.find((c) => c.id === creatorId) || null;
}

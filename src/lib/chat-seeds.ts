export type SeedSource = "onboarding-class" | "asset" | "insight";

// A forward cone attached to a scenario-explore seed. Values are already in
// display-currency numbers (the seed builder converts them); the chat renders
// these through the shared ProjectionChart card.
export interface ExploreCone {
  history: Array<{ t: number; v: number }>;
  today: { t: number; v: number } | null;
  horizon: { t: number; low: number; mid: number; high: number } | null;
  horizonYear: number;
  symbol: string;
  line: string;
}

export interface ChatSeed {
  message: string;
  chips: string[];
  /** Present only on the scenario-explore seed: the forward-projection cone. */
  cone?: ExploreCone;
}

const ONBOARDING_CLASS_SEEDS: Record<string, ChatSeed> = {
  stocks: {
    message: "Tell me what you own — type it, paste a screenshot, or pick a category below.",
    chips: ["List them in chat", "Paste a screenshot", "Take a photo of my broker"],
  },
  "real-estate": {
    message: "Property — let's get the essentials.",
    chips: ["Tell me the address", "Paste a listing", "Just the value for now"],
  },
  crypto: {
    message: "Crypto holdings.",
    chips: ["List them in chat", "Paste an exchange screenshot", "Just the totals"],
  },
  cash: {
    message: "Cash and savings.",
    chips: ["Just the total", "By account", "Skip for now"],
  },
  pension: {
    message: "Pension and retirement.",
    chips: ["Just the total", "By provider", "Skip for now"],
  },
  other: {
    message: "Tell me about it.",
    chips: ["Bonds", "Gold or commodities", "Something else"],
  },
};

const ASSET_CHIPS = ["How is it performing?", "When did I buy?", "What's my return?"];
const INSIGHT_CHIPS = ["Tell me more", "Why does this matter?", "What should I do?"];

export function getChatSeed(
  source: SeedSource,
  key: string,
  prerenderedMessage?: string,
): ChatSeed | null {
  if (source === "onboarding-class") {
    return ONBOARDING_CLASS_SEEDS[key] ?? null;
  }
  if (source === "asset") {
    if (!prerenderedMessage) return null;
    return { message: prerenderedMessage, chips: ASSET_CHIPS };
  }
  if (source === "insight") {
    if (!prerenderedMessage) return null;
    return { message: prerenderedMessage, chips: INSIGHT_CHIPS };
  }
  return null;
}

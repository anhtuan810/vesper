export type SeedSource = "onboarding-class" | "asset" | "insight";

export interface ChatSeed {
  message: string;
  chips: string[];
}

const ONBOARDING_CLASS_SEEDS: Record<string, ChatSeed> = {
  stocks: {
    message: "Let's start with what you hold publicly.",
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

export type SeedSource = "onboarding-class" | "asset" | "insight";

import type { ScenarioHandoff } from "@/lib/scenario/handoff";

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
  /** Per-chip pre-computed scenario handoffs. When a tapped chip has one, the
   *  chat dispatches it via sendScenario (deterministic figures, model narrates)
   *  rather than sending the chip text to the classifier. */
  chipActions?: Record<string, ScenarioHandoff>;
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

// Seed-chip vocabulary buckets, for deterministic telemetry classification. The
// labels are static UI prompts (no user data), so chip telemetry can tag which
// seed surface a tapped chip came from without sending anything PII-bearing.
const ONBOARDING_SEED_CHIPS: ReadonlySet<string> = new Set(
  Object.values(ONBOARDING_CLASS_SEEDS).flatMap((s) => s.chips),
);
const ASSET_SEED_CHIPS: ReadonlySet<string> = new Set(ASSET_CHIPS);
const INSIGHT_SEED_CHIPS: ReadonlySet<string> = new Set(INSIGHT_CHIPS);

export function seedKindForChip(label: string): "onboarding" | "asset" | "insight" | null {
  if (ONBOARDING_SEED_CHIPS.has(label)) return "onboarding";
  if (ASSET_SEED_CHIPS.has(label)) return "asset";
  if (INSIGHT_SEED_CHIPS.has(label)) return "insight";
  return null;
}

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

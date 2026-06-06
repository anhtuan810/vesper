import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const VITAL_KEY_LABELS: Record<string, string> = {
  concentration: "equities",
  realAssetWeight: "property",
  cashRealYield: "cash",
  leverage: "mortgaged property",
  liquidityPosture: "liquid assets",
  drawdown: "markets",
  realGrowth: "growth assets",
};

const ABSENT_PRIORITY_ALL: Array<{ key: string; label: string }> = [
  { key: "realAssetWeight", label: "property" },
  { key: "concentration", label: "equity exposure" },
  { key: "cashRealYield", label: "cash position" },
  { key: "leverage", label: "mortgage exposure" },
];

const ABSENT_PRIORITY_LIQUID: Array<{ key: string; label: string }> = [
  { key: "concentration", label: "equity exposure" },
  { key: "cashRealYield", label: "cash position" },
  { key: "liquidityPosture", label: "liquidity data" },
];

function buildThinPulse(
  activeVitals: Array<{ key: string; value: unknown; band: string }>,
  lens: "all" | "liquid",
): string {
  const keySet = new Set(activeVitals.map((v) => v.key));
  const absentPriority =
    lens === "liquid" ? ABSENT_PRIORITY_LIQUID : ABSENT_PRIORITY_ALL;

  const held = activeVitals
    .map((v) => VITAL_KEY_LABELS[v.key])
    .filter(Boolean)
    .slice(0, 2)
    .join(" and ");

  const absent =
    absentPriority.find(({ key }) => !keySet.has(key))?.label ??
    "pension exposure";

  return `Your sheet is concentrated in ${held || "a few positions"}, with no ${absent} yet.`;
}

// The [v2] marker in SYSTEM_PROMPT_ALL is intentional: it forces a fresh
// generation whenever the system prompt changes, because the route treats any
// cached detail that doesn't carry the PULSE_VER prefix as stale.
const SYSTEM_PROMPT_ALL = `Emit ONE synthesis sentence, 15–25 words, describing the current state across the active portfolio Vitals. Mark key numbers and nouns with *asterisks* — the frontend converts them to emphasis. Tone: a private banker reading the chart aloud — calm, declarative, no coaching, no exclamation, no emoji. Plain text only; no quotes, no markdown beyond the *asterisks*. CRITICAL framing rule: when concentration.value.topPositionIsRealEstate is true, the home is a STRUCTURAL ANCHOR — never a concentration risk. All concentration commentary must reference investableTopPositionPct (the investable book), not the gross figure or the home position itself. Do not use phrases like "concentration risk" or "concentrated in" in reference to the home or real estate.`;

const SYSTEM_PROMPT_LIQUID = `Emit ONE synthesis sentence, 15–25 words, describing the current state across the active investable portfolio Vitals. Mark key numbers and nouns with *asterisks* — the frontend converts them to emphasis. Tone: a private banker reading the chart aloud — calm, declarative, no coaching, no exclamation, no emoji. Plain text only; no quotes, no markdown beyond the *asterisks*. STRICT exclusion: the user has removed property from this lens. You MUST NOT mention the home, property, real estate, real-asset weight, mortgage, or leverage in any form whatsoever.`;

export async function generatePulse(
  activeVitals: Array<{ key: string; value: unknown; band: string }>,
  displayCurrency: string,
  lens: "all" | "liquid" = "all",
): Promise<string | null> {
  if (activeVitals.length <= 3) {
    return buildThinPulse(activeVitals, lens);
  }

  const systemPrompt =
    lens === "liquid" ? SYSTEM_PROMPT_LIQUID : SYSTEM_PROMPT_ALL;

  // Retry the model call once on a transient error before giving up. A null
  // return is not fatal: the route falls back to the last cached Pulse, so the
  // banner keeps the previous sentence rather than blanking.
  let response: Anthropic.Messages.Message | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 80,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Active vitals (display currency: ${displayCurrency}):\n${JSON.stringify(activeVitals)}\n\nWrite one synthesis sentence.`,
          },
        ],
      });
      break;
    } catch {
      if (attempt === 1) return null;
    }
  }
  if (!response) return null;

  const raw = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim()
    .replace(/^["']|["']$/g, "");

  if (!raw) return null;

  const wordCount = raw
    .replace(/\*[^*]+\*/g, (m) => m.slice(1, -1))
    .split(/\s+/)
    .filter(Boolean).length;
  if (wordCount < 10 || wordCount > 35) return null;

  // Safety net: if the gross top position is real estate and the generated
  // sentence uses concentration language without referencing the investable
  // book, the home-anchor framing failed — fall back to deterministic rather
  // than serving a stale "concentration risk" sentence.
  const concVal = activeVitals.find((v) => v.key === "concentration")?.value;
  const topPositionIsRealEstate =
    (concVal as Record<string, unknown> | null)?.topPositionIsRealEstate ===
    true;
  if (
    topPositionIsRealEstate &&
    /concentration|concentrated/i.test(raw) &&
    !/investable/i.test(raw)
  ) {
    return buildThinPulse(activeVitals, lens);
  }

  return raw;
}

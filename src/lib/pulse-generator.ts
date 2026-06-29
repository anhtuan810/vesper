import Anthropic from "@anthropic-ai/sdk";
import { ADVICE_BOUNDARY } from "./claude";

const anthropic = new Anthropic();

type ActiveVital = { key: string; value: unknown; band: string };

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
  activeVitals: ActiveVital[],
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
const NUMBER_FORMAT_RULE = `Write every number in European (Dutch) notation: a comma for the decimal separator and a period for thousands — e.g. 67,5%, €1,2M, €365.000. Never use a period as a decimal separator (never "67.5%").`;

const SYSTEM_PROMPT_ALL = `Emit ONE synthesis sentence, 15–25 words, describing the current state across the active portfolio Vitals. Mark key numbers and nouns with *asterisks* — the frontend converts them to emphasis. Tone: a private banker reading the chart aloud — calm, declarative, no coaching, no exclamation, no emoji. Plain text only; no quotes, no markdown beyond the *asterisks*. ${NUMBER_FORMAT_RULE} CRITICAL framing rule: when concentration.value.topPositionIsRealEstate is true, the home is a STRUCTURAL ANCHOR — never a concentration risk. All concentration commentary must reference investableTopPositionPct (the investable book), not the gross figure or the home position itself. Do not use phrases like "concentration risk" or "concentrated in" in reference to the home or real estate.

${ADVICE_BOUNDARY}`;

const SYSTEM_PROMPT_LIQUID = `Emit ONE synthesis sentence, 15–25 words, describing the current state across the active investable portfolio Vitals. Mark key numbers and nouns with *asterisks* — the frontend converts them to emphasis. Tone: a private banker reading the chart aloud — calm, declarative, no coaching, no exclamation, no emoji. Plain text only; no quotes, no markdown beyond the *asterisks*. ${NUMBER_FORMAT_RULE} STRICT exclusion: the user has removed property from this lens. You MUST NOT mention the home, property, real estate, real-asset weight, mortgage, or leverage in any form whatsoever.

${ADVICE_BOUNDARY}`;

// Defends the deterministic-calculates / LLM-explains contract: strips fields
// the model must never reference. (1) A realGrowth vital with no real value/band
// — dormant vitals are already excluded upstream via `applies`, but this is a
// belt-and-braces check so a stale or malformed entry can't surface a stray
// figure. (2) Whichever concentration "top position" basis the Concentration
// card ISN'T showing for this lens — liquid lens, and an "all" lens whose
// gross top position is the home, both display the investable basis, so the
// gross topPositionPct/topPositionName/top3Pct are removed before the model
// ever sees them and can't quote a second, mismatched number.
function sanitizeVitalsForPulse(
  activeVitals: ActiveVital[],
  lens: "all" | "liquid",
): ActiveVital[] {
  return activeVitals
    .filter((v) => v.key !== "realGrowth" || (v.value != null && v.band != null))
    .map((v) => {
      if (v.key !== "concentration" || v.value == null || typeof v.value !== "object") {
        return v;
      }
      const conc = v.value as Record<string, unknown>;
      const topPositionIsRealEstate = conc.topPositionIsRealEstate === true;
      if (lens === "liquid" || topPositionIsRealEstate) {
        const sanitized = { ...conc };
        delete sanitized.topPositionPct;
        delete sanitized.topPositionName;
        delete sanitized.top3Pct;
        return { ...v, value: sanitized };
      }
      return v;
    });
}

export async function generatePulse(
  activeVitals: ActiveVital[],
  displayCurrency: string,
  lens: "all" | "liquid" = "all",
): Promise<string | null> {
  const sanitized = sanitizeVitalsForPulse(activeVitals, lens);

  if (sanitized.length <= 3) {
    return buildThinPulse(sanitized, lens);
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
            content: `Active vitals (display currency: ${displayCurrency}):\n${JSON.stringify(sanitized)}\n\nWrite one synthesis sentence.`,
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
  const concVal = sanitized.find((v) => v.key === "concentration")?.value;
  const topPositionIsRealEstate =
    (concVal as Record<string, unknown> | null)?.topPositionIsRealEstate ===
    true;
  if (
    topPositionIsRealEstate &&
    /concentration|concentrated/i.test(raw) &&
    !/investable/i.test(raw)
  ) {
    return buildThinPulse(sanitized, lens);
  }

  return raw;
}

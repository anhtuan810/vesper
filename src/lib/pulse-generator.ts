import Anthropic from "@anthropic-ai/sdk";
import { ADVICE_BOUNDARY } from "./claude";

const anthropic = new Anthropic();

type ActiveVital = { key: string; value: unknown; band: string };
export type PulseLens = "all" | "liquid";

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

// Deterministic, LLM-free Pulse sentence. Used both when a portfolio is too thin
// to be worth a Haiku call (≤3 vitals) and, from the route, as the last-resort
// fallback so the Pulse row is never left blank when generation fails and no
// prior sentence is cached.
export function buildThinPulse(
  activeVitals: ActiveVital[],
  lens: PulseLens,
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

// LANGUAGE first, then number grammar. The explicit "in English" guard exists
// because an earlier "(Dutch) notation" phrasing made the model write the whole
// sentence in Dutch — we want English prose with continental number formatting.
const NUMBER_FORMAT_RULE = `Write every sentence in ENGLISH. Format numbers in the continental European style only — a comma for the decimal separator and a period for thousands (e.g. 67,5%, €1,2M, €365.000); never a period as the decimal separator (never "67.5%"). The number style does NOT change the language: the prose stays English.`;

// Per-lens framing rules, carried over verbatim from the former one-call-per-lens
// prompts (SYSTEM_PROMPT_ALL / SYSTEM_PROMPT_LIQUID).
const LENS_RULES: Record<PulseLens, string> = {
  all: `describes the current state across the active portfolio Vitals. CRITICAL framing rule: when concentration.value.topPositionIsRealEstate is true, the home is a STRUCTURAL ANCHOR — never a concentration risk. All concentration commentary must reference investableTopPositionPct (the investable book), not the gross figure or the home position itself. Do not use phrases like "concentration risk" or "concentrated in" in reference to the home or real estate.`,
  liquid: `describes the current state across the active investable portfolio Vitals. STRICT exclusion: the user has removed property from this lens. You MUST NOT mention the home, property, real estate, real-asset weight, mortgage, or leverage in any form whatsoever.`,
};

// Both lenses ride ONE Haiku call (2026-07 cost pass; was one call per lens):
// the model returns a JSON object with a sentence per requested lens.
function mergedSystemPrompt(lenses: PulseLens[]): string {
  const keys = lenses.map((l) => `"${l}"`).join(", ");
  const sections = lenses.map((l) => `- "${l}" ${LENS_RULES[l]}`).join("\n");
  return `Output ONLY a JSON object with exactly ${lenses.length === 1 ? "this key" : "these keys"}: ${keys}. No prose, no markdown, no code fences.
Each value is ONE synthesis sentence, 15–25 words. Mark key numbers and nouns with *asterisks* — the frontend converts them to emphasis. Tone: a private banker reading the chart aloud — calm, declarative, no coaching, no exclamation, no emoji. Within a sentence: plain text only, no quotes, no markdown beyond the *asterisks*. ${NUMBER_FORMAT_RULE}

${sections}

${ADVICE_BOUNDARY}`;
}

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
  lens: PulseLens,
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

// Per-sentence acceptance, unchanged from the former per-lens call: length gate
// (null → the route falls back to the last cached sentence, uncached), and the
// home-anchor safety net (a "concentration" sentence that ignores the investable
// framing is replaced by the deterministic thin sentence rather than served).
function validatePulseSentence(
  raw: unknown,
  sanitized: ActiveVital[],
  lens: PulseLens,
): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/^["']|["']$/g, "");
  if (!s) return null;

  const wordCount = s
    .replace(/\*[^*]+\*/g, (m) => m.slice(1, -1))
    .split(/\s+/)
    .filter(Boolean).length;
  if (wordCount < 10 || wordCount > 35) return null;

  const concVal = sanitized.find((v) => v.key === "concentration")?.value;
  const topPositionIsRealEstate =
    (concVal as Record<string, unknown> | null)?.topPositionIsRealEstate ===
    true;
  if (
    topPositionIsRealEstate &&
    /concentration|concentrated/i.test(s) &&
    !/investable/i.test(s)
  ) {
    return buildThinPulse(sanitized, lens);
  }

  return s;
}

// Generate the Pulse sentence(s) for the requested lenses — pass null for a lens
// that doesn't need generating (cache hit, or not a mixed portfolio). At most ONE
// model call is made per invocation, regardless of how many lenses are requested;
// thin portfolios (≤3 vitals in a lens) get their deterministic sentence with no
// model call at all. A lens returns null when generation failed its gates — the
// route then falls back to the last cached sentence (stale beats blank).
export async function generatePulses(
  vitals: { all: ActiveVital[] | null; liquid: ActiveVital[] | null },
  displayCurrency: string,
): Promise<{ all: string | null; liquid: string | null }> {
  const out: { all: string | null; liquid: string | null } = { all: null, liquid: null };
  const sanitizedByLens = new Map<PulseLens, ActiveVital[]>();
  const needModel: PulseLens[] = [];

  for (const lens of ["all", "liquid"] as const) {
    const v = vitals[lens];
    if (!v) continue;
    const sanitized = sanitizeVitalsForPulse(v, lens);
    sanitizedByLens.set(lens, sanitized);
    if (sanitized.length <= 3) {
      out[lens] = buildThinPulse(sanitized, lens);
    } else {
      needModel.push(lens);
    }
  }
  if (needModel.length === 0) return out;

  const userParts = needModel.map((lens) => {
    const label = lens === "all" ? "All-asset" : "Investable (liquid)";
    return `${label} lens ("${lens}") vitals:\n${JSON.stringify(sanitizedByLens.get(lens))}`;
  });

  // Retry the model call once on a transient error before giving up. A null
  // lens is not fatal: the route falls back to the last cached Pulse, so the
  // banner keeps the previous sentence rather than blanking.
  let response: Anthropic.Messages.Message | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 220,
        system: mergedSystemPrompt(needModel),
        messages: [
          {
            role: "user",
            content: `Display currency: ${displayCurrency}.\n\n${userParts.join("\n\n")}\n\nWrite the JSON object.`,
          },
        ],
      });
      break;
    } catch {
      if (attempt === 1) return out;
    }
  }
  if (!response) return out;

  const raw = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim()
    .replace(/^```[\w]*\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
  if (!raw) return out;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!parsed || typeof parsed !== "object") return out;

  for (const lens of needModel) {
    out[lens] = validatePulseSentence(
      (parsed as Record<string, unknown>)[lens],
      sanitizedByLens.get(lens)!,
      lens,
    );
  }
  return out;
}

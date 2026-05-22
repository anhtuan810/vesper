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

const ABSENT_PRIORITY: Array<{ key: string; label: string }> = [
  { key: "realAssetWeight", label: "property" },
  { key: "concentration", label: "equity exposure" },
  { key: "cashRealYield", label: "cash position" },
  { key: "leverage", label: "mortgage exposure" },
];

function buildThinPulse(
  activeVitals: Array<{ key: string; value: unknown; band: string }>,
): string {
  const keySet = new Set(activeVitals.map((v) => v.key));

  const held = activeVitals
    .map((v) => VITAL_KEY_LABELS[v.key])
    .filter(Boolean)
    .slice(0, 2)
    .join(" and ");

  const absent =
    ABSENT_PRIORITY.find(({ key }) => !keySet.has(key))?.label ??
    "pension exposure";

  return `Your sheet is concentrated in ${held || "a few positions"}, with no ${absent} yet.`;
}

export async function generatePulse(
  activeVitals: Array<{ key: string; value: unknown; band: string }>,
  displayCurrency: string,
): Promise<string | null> {
  if (activeVitals.length <= 3) {
    return buildThinPulse(activeVitals);
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 80,
      system: `Emit ONE synthesis sentence, 15–25 words, describing the current state across the active portfolio Vitals. Mark key numbers and nouns with *asterisks* — the frontend converts them to emphasis. Tone: a private banker reading the chart aloud — calm, declarative, no coaching, no exclamation, no emoji. Plain text only; no quotes, no markdown beyond the *asterisks*.`,
      messages: [
        {
          role: "user",
          content: `Active vitals (display currency: ${displayCurrency}):\n${JSON.stringify(activeVitals)}\n\nWrite one synthesis sentence.`,
        },
      ],
    });

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

    return raw;
  } catch {
    return null;
  }
}

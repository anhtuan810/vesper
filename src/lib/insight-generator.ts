import Anthropic from "@anthropic-ai/sdk";
import { computeCurrentBalance } from "./mortgage";
import { extractNumbers } from "@/lib/narrate/guardrail";
import { ADVICE_BOUNDARY } from "./claude";
import type { Asset } from "./supabase";

const anthropic = new Anthropic();

const MAX_TITLE_LEN = 40;

function buildPortfolioSummary(assets: Asset[]): string {
  const grossTotal = assets.reduce((sum, a) => sum + a.value, 0);
  const netTotal = assets.reduce((sum, a) =>
    sum + (a.type === "real_estate" ? a.value - computeCurrentBalance(a) : a.value), 0);

  const byType = assets.reduce((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + a.value;
    return acc;
  }, {} as Record<string, number>);

  const positions = [...assets]
    .sort((a, b) => b.value - a.value)
    .map((a) => {
      const pct = grossTotal > 0 ? ((a.value / grossTotal) * 100).toFixed(0) : "0";
      if (a.type === "real_estate") {
        const equity = Math.round(a.value - computeCurrentBalance(a));
        return `- ${a.name} (real_estate): $${equity.toLocaleString()} equity, ${pct}% of gross`;
      }
      let line = `- ${a.name} (${a.type}): $${Math.round(a.value).toLocaleString()} (${pct}%)`;
      if (a.units && a.symbol) line += `, ${a.units} ${a.symbol} shares`;
      return line;
    })
    .join("\n");

  const alloc = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([t, v]) => `${t}: ${((v / grossTotal) * 100).toFixed(0)}%`)
    .join(", ");

  return [
    `Net worth: $${Math.round(netTotal).toLocaleString()} (gross: $${Math.round(grossTotal).toLocaleString()})`,
    `Positions:\n${positions}`,
    `Allocation: ${alloc}`,
  ].join("\n");
}

const COMMON_ABSENT_PRIORITY = ["cash", "pension", "real_estate", "crypto", "stocks"] as const;

function buildThinPortfolioInsight(assets: Asset[]): { title: string; detail: string } | null {
  if (assets.length === 0) return null;
  const categories = new Set(assets.map((a) => a.type));
  const absent = COMMON_ABSENT_PRIORITY.filter((c) => !categories.has(c));
  const topAbsent = absent.slice(0, 2).map((c) =>
    c === "real_estate" ? "property" : c
  );

  if (assets.length === 1) {
    const name = assets[0].name;
    const gap = topAbsent.join(" and ") || "other asset classes";
    // Title must carry meaning on its own — a bare asset name ("Hosingenhof
    // 19") reads as a glitch in the band, not a headline.
    return {
      title: "A single anchor",
      detail: `${name} is your only tracked position. Adding ${gap} would give Volnar a fuller picture of your net worth.`,
    };
  }

  const names = assets.slice(0, 2).map((a) => a.name).join(" and ");
  const gap = topAbsent.join(" and ") || "other classes";
  return {
    title: "Getting started",
    detail: `Your portfolio is anchored in ${names}. Common additions at this stage: ${gap} — worth tracking for a complete net worth view.`,
  };
}

export async function generateInsight(assets: Asset[]): Promise<{ title: string; detail: string } | null> {
  if (assets.length <= 3) {
    return buildThinPortfolioInsight(assets);
  }

  try {
    const summary = buildPortfolioSummary(assets);

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 120,
      system: `Produce a portfolio insight in the voice of a private banker writing a warm but honest note to their client.

Output a single JSON object: {"title": string, "detail": string}.
- "title": a 2-4 word headline naming the topic (e.g. "Currency exposure", "Strong quarter", "Cash drag"). No numbers, no punctuation. Must NOT repeat or restate "detail" — it is a label, not a sentence.
- "detail": two full, standalone sentences, 25-32 words total. The first states a specific observation with a real number or pattern. The second says what it means or why it's notable.

Tone calibration — choose by what the data shows:
1. Positive observation (use when justified): notable growth, smart concentration that paid off, steady contributions, diversification, healthy cash buffer, beating typical benchmarks. Lead with the good thing in warm language.
2. Neutral with warmth (use when ambiguous): state a fact without judgment. Avoid lecturing.
3. Cautionary (use only when warranted): single-position concentration above 35%, six-month drift in a category, currency exposure mismatch. Frame as 'worth knowing', never as a warning.

Bias toward (1) and (2). The user opens the app to see how their portfolio is doing — greet them well when the data supports it. Don't manufacture concern that isn't there.

Style rules:
- "detail" is plain text — no markdown, no asterisks, no quotes, no emojis
- No advice, no recommendations, no calls to action
- Never use 'You should' / 'Consider' / 'You might want to'
- Past-tense observations and present-tense interpretations are fine ('has tripled', 'is paying')
- The banker observes; the client decides

Good examples:
{"title": "Public markets", "detail": "Public markets are up 12% this quarter, ahead of typical benchmarks. The compounding is starting to show in your trajectory."}
{"title": "Real estate and NVIDIA", "detail": "Real estate and NVIDIA together make up 51% of your gross portfolio. The other half carries your diversification."}
{"title": "NVIDIA concentration", "detail": "NVIDIA is now 24% of net worth, near the threshold where one position drives everything. Worth watching as it grows."}

Reject if "detail" merely restates "title", or if the tone slides into either advice or vague positivity ('great progress!').

Output only the JSON object. No prose, no code fences.

${ADVICE_BOUNDARY}`,
      messages: [
        {
          role: "user",
          content: `Portfolio summary:\n${summary}\n\nWrite a portfolio insight.`,
        },
      ],
    });

    const raw = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()
      .replace(/^```[\w]*\s*/, "")
      .replace(/\s*```$/, "")
      .trim();

    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed || typeof parsed !== "object" ||
      typeof (parsed as Record<string, unknown>).title !== "string" ||
      typeof (parsed as Record<string, unknown>).detail !== "string"
    ) return null;

    const { title, detail } = parsed as { title: string; detail: string };

    if (title.length === 0 || title.length > MAX_TITLE_LEN || extractNumbers(title).length > 0) return null;

    const sentences = detail.match(/[^.!?]+[.!?]+/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
    if (sentences.length < 1 || sentences.length > 3) return null;

    const totalWords = detail.split(/\s+/).filter(Boolean).length;
    if (totalWords < 10 || totalWords > 60) return null;

    if (/\byou should\b|\bconsider\b|\byou might\b|\byou could\b/i.test(detail)) return null;

    // detail must read as a standalone sentence, not a restatement of title
    if (detail.toLowerCase().startsWith(title.toLowerCase())) return null;

    return { title, detail };
  } catch {
    return null;
  }
}

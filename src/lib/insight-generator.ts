import Anthropic from "@anthropic-ai/sdk";
import { computeCurrentBalance } from "./mortgage";
import type { Asset } from "./supabase";

const anthropic = new Anthropic();

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
        return `- ${a.name} (real_estate): €${equity.toLocaleString()} equity, ${pct}% of gross`;
      }
      let line = `- ${a.name} (${a.type}): €${Math.round(a.value).toLocaleString()} (${pct}%)`;
      if (a.units && a.symbol) line += `, ${a.units} ${a.symbol} shares`;
      return line;
    })
    .join("\n");

  const alloc = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([t, v]) => `${t}: ${((v / grossTotal) * 100).toFixed(0)}%`)
    .join(", ");

  return [
    `Net worth: €${Math.round(netTotal).toLocaleString()} (gross: €${Math.round(grossTotal).toLocaleString()})`,
    `Positions:\n${positions}`,
    `Allocation: ${alloc}`,
  ].join("\n");
}

export async function generateInsight(assets: Asset[]): Promise<string | null> {
  try {
    const summary = buildPortfolioSummary(assets);

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 80,
      system: `You write a single-sentence portfolio observation for a private client dashboard.

Rules:
- Exactly one sentence, 12–25 words.
- Plain text — no markdown, no quotes, no emojis.
- Observation only — no advice or recommendations.
- Wrap the single most important noun phrase in *single asterisks*.
- No hedging ("perhaps", "might", "could").
- No proper names beyond ticker symbols and asset class labels.

Examples:
"ASML and NVDA together drive *three-quarters* of your liquid portfolio."
"Your tech exposure is now *38%* of liquid holdings — the highest it has been this quarter."
"Real estate equity grew *€12k* this month from amortization alone."`,
      messages: [
        {
          role: "user",
          content: `Portfolio summary:\n${summary}\n\nWrite one observation sentence.`,
        },
      ],
    });

    const raw = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()
      // Strip surrounding quotes if the model adds them
      .replace(/^["']|["']$/g, "");

    return raw || null;
  } catch {
    return null;
  }
}

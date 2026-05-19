import Anthropic from "@anthropic-ai/sdk";
import type { Asset } from "./supabase";

const anthropic = new Anthropic();

export const TRADEABLE_TYPES = new Set(["stocks", "etf", "crypto"]);

export interface MarketHighlight {
  id?: string;
  title: string;
  detail: string;
  impact_eur: number | null;
  symbol: string | null;
}

// Serialized into the `detail` column for type='market' rows.
interface StoredDetail {
  text: string;
  impact_eur: number | null;
  symbol: string | null;
}

export function parseMarketDetail(raw: string): { text: string; impact_eur: number | null; symbol: string | null } {
  try {
    const p = JSON.parse(raw) as StoredDetail;
    if (p && typeof p.text === "string") {
      return {
        text: p.text,
        impact_eur: typeof p.impact_eur === "number" && isFinite(p.impact_eur) ? p.impact_eur : null,
        symbol: typeof p.symbol === "string" ? p.symbol : null,
      };
    }
  } catch {}
  return { text: raw, impact_eur: null, symbol: null };
}

export function serializeMarketDetail(h: { detail: string; impact_eur: number | null; symbol: string | null }): string {
  return JSON.stringify({ text: h.detail, impact_eur: h.impact_eur, symbol: h.symbol });
}

export async function fetchMarketHighlights(assets: Asset[]): Promise<{
  highlights: MarketHighlight[];
  inputTokens: number;
  outputTokens: number;
}> {
  const tradeable = assets.filter((a) => TRADEABLE_TYPES.has(a.type));
  const today = new Date().toISOString().slice(0, 10);

  const holdingsLines = tradeable
    .map((a) => `${a.symbol ?? a.name} | ${a.type} | €${Math.round(a.value)}`)
    .join("\n");

  const tradeableSymbols = new Set(
    tradeable.map((a) => (a.symbol ?? a.name).toLowerCase())
  );

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: `You filter daily financial news for a personal portfolio. You have access to web_search.
1. Search for major financial market news from the last 24 hours relevant to the holdings provided.
2. Return 3 items that DIRECTLY affect those specific holdings; return fewer only if relevant stories genuinely do not exist. Exclude broad macro commentary unless the holding is a broad index ETF.
3. For each item: title (max 100 chars; aim for ~60 chars so it reads cleanly on a narrow viewport, may wrap to a second line), detail (max 240 chars; complete the main clause in the first ~80 chars so a clip at the end still reads as a full thought), estimated portfolio impact in EUR if reasonably inferable from public data (otherwise null), and the affected symbol from the holdings list.
4. Output ONLY a JSON array. No prose, no markdown, no code fences.
Schema: [{ "title": string, "detail": string, "impact_eur": number | null, "symbol": string | null }]
5. If nothing directly relevant, return [].`,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [{ role: "user", content: `Holdings:\n${holdingsLines}\n\nToday: ${today}` }],
  });

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  const textBlock = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("")
    .trim();

  let raw: unknown[];
  try {
    raw = JSON.parse(textBlock);
    if (!Array.isArray(raw)) throw new Error("not an array");
  } catch (err) {
    if (process.env.SENTRY_DSN) {
      try {
        const Sentry = await import("@sentry/nextjs");
        Sentry.captureException(err, { extra: { raw: textBlock.slice(0, 500) } });
      } catch {}
    }
    return { highlights: [], inputTokens, outputTokens };
  }

  const highlights: MarketHighlight[] = raw
    .slice(0, 3)
    .map((item): MarketHighlight | null => {
      if (typeof item !== "object" || item === null) return null;
      const r = item as Record<string, unknown>;
      if (typeof r.title !== "string" || typeof r.detail !== "string") return null;
      if (r.title.length > 100) return null;
      if (r.detail.length > 240) return null;
      const sym = typeof r.symbol === "string" ? r.symbol : null;
      if (sym && !tradeableSymbols.has(sym.toLowerCase())) return null;
      const impact =
        typeof r.impact_eur === "number" && isFinite(r.impact_eur) ? r.impact_eur : null;
      return { title: r.title, detail: r.detail, impact_eur: impact, symbol: sym };
    })
    .filter((h): h is MarketHighlight => h !== null);

  return { highlights, inputTokens, outputTokens };
}

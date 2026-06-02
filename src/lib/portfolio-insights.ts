import Anthropic from "@anthropic-ai/sdk";
import type { Asset } from "./supabase";
import type { FxRates } from "./fx";

const anthropic = new Anthropic();

// ── EUR conversion ────────────────────────────────────────────────────────────

/** Convert any-currency amount to EUR. rates: { quote: units_per_usd, e.g. EUR: 0.89 } */
export function valueToEur(amount: number, currency: string, rates: FxRates): number {
  if (currency === "EUR") return amount;
  const eurPerUsd = rates.EUR ?? 0.89;
  if (currency === "USD" || !(currency in rates)) return amount * eurPerUsd;
  // amount / rates[currency] = USD; USD * eurPerUsd = EUR
  return (amount / rates[currency]) * eurPerUsd;
}

// ── Shared types ──────────────────────────────────────────────────────────────

export type AssetWithEur = Asset & { valueEur: number };

export interface SnapshotRow {
  date: string;
  breakdown: Record<string, number> | null;
}

// ── Detector context shapes ───────────────────────────────────────────────────

interface ConcentrationCtx {
  type: "concentration";
  name: string;
  symbol: string;
  percentage: number;
  remainingPct: number;
}

interface CashDragCtx {
  type: "cash_drag";
  cashEur: number;
  percentage: number;
  daysHeld: number;
}

interface CurrencyMismatchCtx {
  type: "currency_mismatch";
  dominantCurrency: string;
  percentage: number;
  displayCurrency: string;
  shiftAmountEur: number;
}

type AnyCtx = ConcentrationCtx | CashDragCtx | CurrencyMismatchCtx;
type DetectorResult<T> = { fired: false } | { fired: true; ctx: T };

// ── Detectors ─────────────────────────────────────────────────────────────────

/** Fires when any single asset >= 25% of total EUR net worth. */
export function detectConcentration(assets: AssetWithEur[]): DetectorResult<ConcentrationCtx> {
  const total = assets.reduce((s, a) => s + a.valueEur, 0);
  if (total <= 0) return { fired: false };
  const top = [...assets].sort((a, b) => b.valueEur - a.valueEur)[0];
  if (!top) return { fired: false };
  const pct = (top.valueEur / total) * 100;
  if (pct < 25) return { fired: false };
  return {
    fired: true,
    ctx: {
      type: "concentration",
      name: top.name,
      symbol: top.symbol ?? top.name,
      percentage: Math.round(pct),
      remainingPct: Math.round(100 - pct),
    },
  };
}

/**
 * Fires when (cash + pension) >= 20% of EUR net worth AND that position
 * has been present for >= 30 days.
 * daysHeld is derived from snapshot history first, then asset created_at as fallback.
 */
export function detectCashDrag(
  assets: AssetWithEur[],
  snapshots: SnapshotRow[],
): DetectorResult<CashDragCtx> {
  const total = assets.reduce((s, a) => s + a.valueEur, 0);
  if (total <= 0) return { fired: false };
  const cashAssets = assets.filter((a) => a.type === "cash" || a.type === "pension");
  const cashEur = cashAssets.reduce((s, a) => s + a.valueEur, 0);
  const pct = (cashEur / total) * 100;
  if (pct < 20) return { fired: false };

  // Walk backwards through daily snapshots; breakdown values are in USD (ratios are currency-agnostic)
  let daysHeld = 0;
  const sorted = [...snapshots].sort((a, b) => b.date.localeCompare(a.date));
  for (const snap of sorted) {
    const bd = snap.breakdown ?? {};
    const snapCash = (bd["cash"] ?? 0) + (bd["pension"] ?? 0);
    const snapTotal = Object.values(bd).reduce((s, v) => s + v, 0);
    if (snapTotal > 0 && snapCash / snapTotal >= 0.2) {
      daysHeld = Math.max(daysHeld, Math.floor((Date.now() - new Date(snap.date).getTime()) / 86_400_000));
    } else {
      break; // cash dropped below 20% before this date — stop counting
    }
  }
  // Fallback: oldest cash-asset record creation date
  if (daysHeld === 0 && cashAssets.length > 0) {
    const oldest = Math.min(...cashAssets.map((a) => new Date(a.created_at).getTime()));
    daysHeld = Math.floor((Date.now() - oldest) / 86_400_000);
  }
  if (daysHeld < 30) return { fired: false };

  return {
    fired: true,
    ctx: { type: "cash_drag", cashEur: Math.round(cashEur), percentage: Math.round(pct), daysHeld },
  };
}

/**
 * Fires when total non-display-currency exposure >= 25% of EUR net worth.
 * Reports the dominant foreign currency and the EUR impact of a 1% move.
 */
export function detectCurrencyMismatch(
  assets: AssetWithEur[],
  displayCurrency: string,
): DetectorResult<CurrencyMismatchCtx> {
  const total = assets.reduce((s, a) => s + a.valueEur, 0);
  if (total <= 0) return { fired: false };
  const byCurrency: Record<string, number> = {};
  for (const a of assets) {
    const cur = a.currency ?? "USD";
    if (cur !== displayCurrency) byCurrency[cur] = (byCurrency[cur] ?? 0) + a.valueEur;
  }
  const nonDisplayTotal = Object.values(byCurrency).reduce((s, v) => s + v, 0);
  if ((nonDisplayTotal / total) * 100 < 25) return { fired: false };
  const [dominant] = Object.entries(byCurrency).sort((a, b) => b[1] - a[1]);
  if (!dominant) return { fired: false };
  return {
    fired: true,
    ctx: {
      type: "currency_mismatch",
      dominantCurrency: dominant[0],
      percentage: Math.round((dominant[1] / total) * 100),
      displayCurrency,
      shiftAmountEur: Math.round(total * 0.01),
    },
  };
}

// ── Deterministic template fallbacks ─────────────────────────────────────────

// Every number shown in the insight band is formatted here, in the exact form
// it will render (nl-NL, with unit/symbol). The same strings are (a) the only
// numbers handed to Haiku, (b) the allow-list its output is validated against,
// and (c) the deterministic fallback copy — so a displayed figure can never
// drift from the deterministically computed one.

const nlNum = (n: number) => new Intl.NumberFormat("nl-NL").format(n);
const eur = (n: number) => `€${nlNum(n)}`;
const pctStr = (n: number) => `${n}%`;

type FormattedCtx = {
  payload: Record<string, unknown>; // model input — figures only as pre-formatted strings
  figures: string[];                // allow-list of display figures
  sentence: string;                 // deterministic fallback copy
};

function formatCtx(ctx: AnyCtx): FormattedCtx {
  switch (ctx.type) {
    case "concentration": {
      const top = pctStr(ctx.percentage);
      const rest = pctStr(ctx.remainingPct);
      return {
        payload: { detector: "concentration", name: ctx.name, topShare: top, remainingShare: rest },
        figures: [top, rest],
        sentence: `${ctx.name} represents ${top} of your net worth, leaving ${rest} across the rest to absorb volatility.`,
      };
    }
    case "cash_drag": {
      const amount = eur(ctx.cashEur);
      const share = pctStr(ctx.percentage);
      const days = String(ctx.daysHeld);
      return {
        payload: { detector: "cash_drag", cashAmount: amount, cashShare: share, daysHeld: days },
        figures: [amount, share, days],
        sentence: `${amount} (${share}) has been sitting in cash for ${days} days — a drag on portfolio returns at current rates.`,
      };
    }
    case "currency_mismatch": {
      const share = pctStr(ctx.percentage);
      const shift = eur(ctx.shiftAmountEur);
      return {
        payload: {
          detector: "currency_mismatch",
          dominantCurrency: ctx.dominantCurrency,
          displayCurrency: ctx.displayCurrency,
          foreignShare: share,
          onePercentMove: "1%",
          shiftAmount: shift,
        },
        figures: [share, "1%", shift],
        sentence: `${share} of your portfolio is in ${ctx.dominantCurrency}; a 1% move against ${ctx.displayCurrency} shifts net worth by roughly ${shift}.`,
      };
    }
  }
}

function templateSentence(ctx: AnyCtx): string {
  return formatCtx(ctx).sentence;
}

// ── Numeric-integrity guard ──────────────────────────────────────────────────
// Every numeric token in Haiku's output must be one of the pre-formatted
// figures. A currency symbol or trailing % is kept; trailing separators and
// whitespace are dropped before comparison.

const NUM_TOKEN = /[€$£]?\s?\d[\d.,]*%?/g;
const normFigure = (t: string) => t.replace(/[.,\s]+$/, "").replace(/\s+/g, "");

function numbersAllowed(sentence: string, figures: string[]): boolean {
  const allowed = new Set(figures.map(normFigure));
  const tokens = sentence.match(NUM_TOKEN) ?? [];
  return tokens.every((t) => allowed.has(normFigure(t)));
}

// ── Haiku wrapper ─────────────────────────────────────────────────────────────

async function wrapWithHaiku(
  contexts: AnyCtx[],
): Promise<{ sentences: string[]; inputTokens: number; outputTokens: number }> {
  const formatted = contexts.map(formatCtx);
  const fallbacks = formatted.map((f) => f.sentence);
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system:
        "You write one-sentence portfolio observations for a private banking app. " +
        "Each input object describes one observation; its figure fields are already formatted for display. " +
        "Copy every figure VERBATIM, exactly as given — never recompute, round, reformat, abbreviate, or invent a number. " +
        "Vary only the surrounding wording. Each sentence: under 110 chars, banker-quiet, no hedging, " +
        "no exclamation marks, no emojis, completes a clear thought. " +
        "Output a JSON array of strings, one per object, in input order. No prose, no code fences.",
      messages: [{ role: "user", content: JSON.stringify(formatted.map((f) => f.payload)) }],
    });
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const raw = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()
      .replace(/^```[\w]*\s*/, "")
      .replace(/\s*```$/, "")
      .trim();
    const parsed: unknown = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length === contexts.length &&
      parsed.every((s) => typeof s === "string" && s.length > 0)
    ) {
      // Numeric-integrity guard: any sentence whose numbers aren't all in the
      // deterministic allow-list is replaced by its deterministic fallback, so
      // a shown figure can never diverge from the computed one.
      const sentences = parsed.map((s, i) =>
        numbersAllowed(s as string, formatted[i].figures) ? (s as string) : fallbacks[i],
      );
      return { sentences, inputTokens, outputTokens };
    }
    return { sentences: fallbacks, inputTokens, outputTokens };
  } catch (err) {
    console.warn("[portfolio-insights] wrapWithHaiku fallback:", err);
    return { sentences: fallbacks, inputTokens: 0, outputTokens: 0 };
  }
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export interface PortfolioInsightResult {
  detectorsFired: string[];  // e.g. ["concentration", "cash_drag"]
  sentences: string[];
  inputTokens: number;
  outputTokens: number;
}

export async function generatePortfolioInsights(
  assets: AssetWithEur[],
  displayCurrency: string,
  snapshots: SnapshotRow[],
): Promise<PortfolioInsightResult> {
  const firedCtxs: AnyCtx[] = [];

  const concentration = detectConcentration(assets);
  if (concentration.fired) firedCtxs.push(concentration.ctx);

  const cashDrag = detectCashDrag(assets, snapshots);
  if (cashDrag.fired) firedCtxs.push(cashDrag.ctx);

  const currencyMismatch = detectCurrencyMismatch(assets, displayCurrency);
  if (currencyMismatch.fired) firedCtxs.push(currencyMismatch.ctx);

  if (firedCtxs.length === 0) {
    return { detectorsFired: [], sentences: [], inputTokens: 0, outputTokens: 0 };
  }

  const { sentences, inputTokens, outputTokens } = await wrapWithHaiku(firedCtxs);
  return {
    detectorsFired: firedCtxs.map((c) => c.type),
    sentences: sentences.slice(0, 3),
    inputTokens,
    outputTokens,
  };
}

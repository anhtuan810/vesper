// Decision Verdict — the retrospective "was this decision right?" stamp.
//
// Two modes, both built on the same pure price engine (reconstructPositionSeries),
// so no model ever produces the figure:
//
//  • SELL / reduce — reconstructs the stake the user LET GO at its value then and
//    now. delta = now − then:  delta < 0 → selling SPARED that loss; delta > 0 →
//    holding would have GAINED that much. The freed-up cash is deliberately not
//    counted — the question is narrowly "the stake you sold: keep or let go?".
//
//  • BUY (initial purchase of a single-name bet) — was the active bet worth it
//    versus the boring default? It values the bought units now and compares them
//    with the SAME capital put into a world index over the same period:
//    delta = position-now − (deployed × index-ratio). delta > 0 → the pick BEAT
//    the index; delta < 0 → it TRAILED it. Index buys (etf) are excluded so we
//    never benchmark the index against itself.
//
// Pure read. Writes nothing. Degrades to { ok:false } (the panel shows nothing)
// whenever the inputs can't support an honest number — not a tradeable, too
// recent, no price history, no cost basis, no benchmark.

import { getHistoricalUsdRates, toDisplay } from "@/lib/fx";
import { fetchHistoricalSeries } from "@/lib/prices";
import { reconstructPositionSeries } from "@/lib/scenario/counterfactual";
import type { createServerSupabase } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createServerSupabase>;

// Sells can be of any tradeable (you can sell your index too). Buy verdicts are
// reserved for active single-name bets — benchmarking an index buy against the
// index is circular, so etf is excluded there.
const TRADEABLE_SELL = new Set(["stocks", "etf", "crypto"]);
const TRADEABLE_BUY = new Set(["stocks", "crypto"]);
// The "do nothing" yardstick a buy is measured against: a broad world tracker.
const BENCHMARK = { symbol: "URTH", label: "the MSCI World" };
// Below this, "looking back" isn't meaningful yet — the decision is too fresh for
// a verdict to say anything but noise. Gated client-side too, so the call is rare.
const MIN_LOOKBACK_DAYS = 21;

const isoDaysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

export interface VerdictData {
  mode: "sell" | "buy";
  // sell: spared (good call) | missed (sold early) | even
  // buy:  beat (outpaced the index) | trailed | matched
  kind: "spared" | "missed" | "even" | "beat" | "trailed" | "matched";
  figure: number; // absolute magnitude, expressed in `currency`
  currency: string; // the currency `figure` is in (display currency, or USD fallback)
  lookbackLabel: string; // e.g. "18 months on"
  assetName: string;
  benchmarkLabel?: string; // buy only — what it was measured against
  // The real figures behind the verdict, so "how this is figured" shows actual
  // numbers, not a generic note. All money is in `currency`.
  detail: {
    units: number; // the stake that left the book (sell) / was bought (buy)
    valueThen: number; // those units' value at the decision-date close (sell: at sale; buy: the baseline)
    valueNow: number; // what those units are worth today
    date: string; // YYYY-MM-DD of the decision
    benchmarkNow?: number; // buy only: that same baseline amount grown at the benchmark, today
  };
}

export type VerdictOutcome =
  | { ok: true; data: VerdictData }
  // every not-eligible path collapses to the same shape; the panel renders nothing.
  | { ok: false; reason: string };

interface MutationRow {
  asset_id: string | null;
  action: string | null;
  before_units: number | null;
  after_units: number | null;
  currency: string | null;
  occurred_at: string | null;
  recorded_at: string | null;
  symbol: string | null;
  asset_type: string | null;
  asset_name: string | null;
}

// Pure: derives the verdict mode, decision units and the content-addressed
// cache key for a mutation — or null when the mutation can't carry a verdict
// (no symbol, not tradeable, no units, too recent). MUST stay in lockstep with
// the inline derivation in assembleVerdict below (same eligibility, same key
// format) — it exists so the chat context can bulk-read cached verdicts
// without recomputing anything.
export function verdictKeyForMutation(
  m: {
    action: string | null;
    before_units: number | null;
    after_units: number | null;
    symbol: string | null;
    asset_type: string | null;
    occurred_at: string | null;
    recorded_at: string | null;
  },
  displayCurrency: string,
): string | null {
  if (!m.symbol) return null;
  const assetType = m.asset_type ?? "";
  const before = typeof m.before_units === "number" ? m.before_units : null;
  const afterRaw = typeof m.after_units === "number" ? m.after_units : null;
  const isReduce = m.action === "remove" || (m.action === "edit" && before != null && afterRaw != null && before > afterRaw);
  let mode: "sell" | "buy";
  let decisionUnits: number;
  if (isReduce) {
    if (!TRADEABLE_SELL.has(assetType) || before == null) return null;
    const after = m.action === "remove" ? 0 : (afterRaw ?? before);
    decisionUnits = before - after;
    mode = "sell";
  } else if (m.action === "add") {
    if (!TRADEABLE_BUY.has(assetType) || afterRaw == null) return null;
    decisionUnits = afterRaw;
    mode = "buy";
  } else {
    return null;
  }
  if (!(decisionUnits > 0)) return null;
  const occurred = (m.occurred_at || m.recorded_at || "").slice(0, 10);
  if (!occurred) return null;
  const daysAgo = Math.floor((Date.now() - Date.parse(occurred)) / 86_400_000);
  if (!(daysAgo >= MIN_LOOKBACK_DAYS)) return null;
  return `${mode}:${m.symbol}:${occurred}:${decisionUnits}:${displayCurrency}`;
}

// Bulk cache read for the chat's decision-journal context: cached-only (never
// computes — chat latency must not depend on price fetches), same-day-fresh
// only (matching readVerdictCache), keyed back to mutation ids. Degrades to {}
// when the table is missing or nothing is cached.
export async function readCachedVerdictsForMutations(
  supabase: SupabaseClient,
  mutations: Array<{
    id: string;
    action: string | null;
    before_units: number | null;
    after_units: number | null;
    symbol: string | null;
    asset_type: string | null;
    occurred_at: string | null;
    recorded_at: string | null;
  }>,
  displayCurrency: string,
): Promise<Record<string, VerdictData>> {
  const keyById = new Map<string, string>();
  for (const m of mutations) {
    const key = verdictKeyForMutation(m, displayCurrency);
    if (key) keyById.set(m.id, key);
  }
  if (keyById.size === 0) return {};
  try {
    const { data } = await supabase
      .from("decision_verdicts")
      .select("verdict_key, computed_on, payload")
      .in("verdict_key", [...new Set(keyById.values())]);
    const today = new Date().toISOString().slice(0, 10);
    const byKey = new Map<string, VerdictData>();
    for (const row of data ?? []) {
      if (row.computed_on === today && row.payload) byKey.set(row.verdict_key as string, row.payload as VerdictData);
    }
    const out: Record<string, VerdictData> = {};
    for (const [id, key] of keyById) {
      const v = byKey.get(key);
      if (v) out[id] = v;
    }
    return out;
  } catch {
    return {};
  }
}

// "18 months on" / "3 weeks on" / "2 years on" — calm, single-unit, no decimals.
// Exported (pure) for the deterministic test suite.
export function lookbackLabel(days: number): string {
  if (days < 60) return `${Math.round(days / 7)} weeks on`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `${months} months on`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? "year" : "years"} on`;
}

// SELL direction + magnitude from the sold stake's value then vs now (both USD).
// delta = now − then:  delta < 0 → fell → SPARED;  delta > 0 → rose → MISSED;
// |delta| within 1% of the basis → a wash ("even"). Pure; exported for the test.
export function classifyVerdict(
  thenUsd: number,
  nowUsd: number,
): { kind: "spared" | "missed" | "even"; magnitudeUsd: number } {
  const deltaUsd = nowUsd - thenUsd;
  const evenThreshold = Math.max(thenUsd * 0.01, 1);
  const kind = Math.abs(deltaUsd) < evenThreshold ? "even" : deltaUsd < 0 ? "spared" : "missed";
  return { kind, magnitudeUsd: Math.abs(deltaUsd) };
}

// BUY direction + magnitude: the position now vs the same capital in the index.
// delta = positionNow − benchmarkNow:  > band → BEAT; < −band → TRAILED; else
// MATCHED (a 3% band, since benchmark gaps are noisier than a raw price move).
// Pure; exported for the test.
export function classifyBuyVerdict(
  positionNowUsd: number,
  benchmarkNowUsd: number,
  deployedUsd: number,
): { kind: "beat" | "trailed" | "matched"; magnitudeUsd: number } {
  const deltaUsd = positionNowUsd - benchmarkNowUsd;
  const band = Math.max(deployedUsd * 0.03, 1);
  const kind = Math.abs(deltaUsd) < band ? "matched" : deltaUsd > 0 ? "beat" : "trailed";
  return { kind, magnitudeUsd: Math.abs(deltaUsd) };
}

// Most recent close on/before `date` from an ascending series (the benchmark only
// needs a price ratio, so no FX is involved).
function priceOnOrBefore(series: { date: string; price: number }[], date: string): number | null {
  let result: number | null = null;
  for (const p of series) {
    if (p.date > date) break;
    result = p.price;
  }
  return result;
}

export async function assembleVerdict(
  supabase: SupabaseClient,
  userId: string,
  mutationId: string,
  displayCurrency: string,
): Promise<VerdictOutcome> {
  const { data: mrow } = await supabase
    .from("mutations")
    .select("asset_id, action, before_units, after_units, currency, occurred_at, recorded_at, symbol, asset_type, asset_name")
    .eq("user_id", userId)
    .eq("id", mutationId)
    .maybeSingle();
  const m = mrow as MutationRow | null;
  if (!m) return { ok: false, reason: "not_found" };
  if (!m.symbol) return { ok: false, reason: "no_symbol" };
  const assetType = m.asset_type ?? "";

  // Classify the decision into a verdict mode and the units it concerns.
  const before = typeof m.before_units === "number" ? m.before_units : null;
  const afterRaw = typeof m.after_units === "number" ? m.after_units : null;
  const isReduce = m.action === "remove" || (m.action === "edit" && before != null && afterRaw != null && before > afterRaw);

  let mode: "sell" | "buy";
  let decisionUnits: number;
  if (isReduce) {
    if (!TRADEABLE_SELL.has(assetType)) return { ok: false, reason: "not_tradeable" };
    if (before == null) return { ok: false, reason: "no_units" };
    const after = m.action === "remove" ? 0 : (afterRaw ?? before);
    decisionUnits = before - after;
    mode = "sell";
  } else if (m.action === "add") {
    // Only an INITIAL purchase of an active single-name bet gets a buy verdict —
    // top-up edits and index buys would just clutter the journal with near-ties.
    if (!TRADEABLE_BUY.has(assetType)) return { ok: false, reason: "not_eligible" };
    if (afterRaw == null) return { ok: false, reason: "no_units" };
    decisionUnits = afterRaw;
    mode = "buy";
  } else {
    return { ok: false, reason: "not_eligible" };
  }
  if (!(decisionUnits > 0)) return { ok: false, reason: "no_units" };

  const occurred = (m.occurred_at || m.recorded_at || "").slice(0, 10); // matches the client's mDate (|| , not ??)
  if (!occurred) return { ok: false, reason: "no_date" };
  const daysAgo = Math.floor((Date.now() - Date.parse(occurred)) / 86_400_000);
  if (!(daysAgo >= MIN_LOOKBACK_DAYS)) return { ok: false, reason: "too_recent" };

  // Cache-first: the verdict only drifts with the slow "now" value, so a row
  // computed earlier today is served as-is. Keyed by content, not mutation id, so
  // it survives the demo reseed and is shared across identical trades. Format
  // must match verdictKeyForMutation above (the chat context's bulk read).
  const verdictKey = `${mode}:${m.symbol}:${occurred}:${decisionUnits}:${displayCurrency}`;
  const cached = await readVerdictCache(supabase, verdictKey);
  if (cached) return { ok: true, data: cached };

  const todayStr = new Date().toISOString().slice(0, 10);
  const fromBuffered = isoDaysAgo(daysAgo + 10); // runway so a close exists on/before the decision date
  // Fetch the position prices, FX, and (for a buy) the benchmark series all at
  // once — the slow part — rather than the benchmark sequentially after.
  const [priceRaw, fxSeries, benchRaw] = await Promise.all([
    fetchHistoricalSeries(m.symbol, fromBuffered, todayStr),
    getHistoricalUsdRates(fromBuffered, todayStr),
    mode === "buy" ? fetchHistoricalSeries(BENCHMARK.symbol, fromBuffered, todayStr) : Promise.resolve(null),
  ]);
  const priceSeries = priceRaw ?? [];
  if (priceSeries.length === 0) return { ok: false, reason: "no_prices" };

  // Value the units the decision concerns at the decision date and today.
  const { series, assumptions } = reconstructPositionSeries([occurred, todayStr], decisionUnits, priceSeries, fxSeries);
  // For a non-USD-priced holding, if the engine couldn't apply FX it leaves the
  // native amount mislabeled as USD — converting that to the display currency
  // would double-apply a rate. Fail closed rather than stamp a number we distrust.
  if (assumptions.some((a) => a.includes("FX unavailable"))) return { ok: false, reason: "no_fx" };
  const thenUsd = series[0]?.valueUsd ?? 0;
  const nowUsd = series[1]?.valueUsd ?? 0;
  if (!(thenUsd > 0)) return { ok: false, reason: "no_basis" }; // no usable price on/before the decision date

  // ── SELL: the stake you let go, then vs now ────────────────────────────────
  if (mode === "sell") {
    const { kind, magnitudeUsd } = classifyVerdict(thenUsd, nowUsd);
    const conv = await convertAll(displayCurrency, { figure: magnitudeUsd, valueThen: thenUsd, valueNow: nowUsd });
    const data: VerdictData = {
      mode: "sell",
      kind,
      figure: conv.figure,
      currency: conv.currency,
      lookbackLabel: lookbackLabel(daysAgo),
      assetName: m.asset_name ?? m.symbol,
      detail: { units: decisionUnits, valueThen: conv.valueThen, valueNow: conv.valueNow, date: occurred },
    };
    await writeVerdictCache(supabase, verdictKey, data);
    return { ok: true, data };
  }

  // ── BUY: the active bet vs the same money in the index ─────────────────────
  const bench = benchRaw ?? [];
  const benchThen = priceOnOrBefore(bench, occurred);
  const benchNow = bench.length > 0 ? bench[bench.length - 1].price : null;
  if (!benchThen || !benchNow || benchThen <= 0 || benchNow <= 0) return { ok: false, reason: "no_benchmark" };

  // The same capital (thenUsd) grown at the index's price return over the period.
  const benchmarkNowUsd = thenUsd * (benchNow / benchThen);
  const { kind, magnitudeUsd } = classifyBuyVerdict(nowUsd, benchmarkNowUsd, thenUsd);
  const conv = await convertAll(displayCurrency, {
    figure: magnitudeUsd,
    valueThen: thenUsd,
    valueNow: nowUsd,
    benchmarkNow: benchmarkNowUsd,
  });
  const data: VerdictData = {
    mode: "buy",
    kind,
    figure: conv.figure,
    currency: conv.currency,
    lookbackLabel: lookbackLabel(daysAgo),
    assetName: m.asset_name ?? m.symbol,
    benchmarkLabel: BENCHMARK.label,
    detail: {
      units: decisionUnits,
      valueThen: conv.valueThen,
      valueNow: conv.valueNow,
      benchmarkNow: conv.benchmarkNow,
      date: occurred,
    },
  };
  await writeVerdictCache(supabase, verdictKey, data);
  return { ok: true, data };
}

// ── Cache helpers ────────────────────────────────────────────────────────────
// Only successful verdicts are cached. Ineligible/failed outcomes (no_prices,
// no_fx, no_benchmark) may be transient infra blips, so they are recomputed rather
// than stuck for the day. Every call degrades gracefully: if the table isn't there
// (migration not yet applied), reads return null and writes no-op — verdicts are
// then computed live, exactly as before the cache existed.
async function readVerdictCache(supabase: SupabaseClient, verdictKey: string): Promise<VerdictData | null> {
  try {
    const { data } = await supabase
      .from("decision_verdicts")
      .select("computed_on, payload")
      .eq("verdict_key", verdictKey)
      .maybeSingle();
    const today = new Date().toISOString().slice(0, 10);
    if (data && data.computed_on === today && data.payload) return data.payload as VerdictData;
  } catch {
    /* table missing or read error — fall through to a live compute */
  }
  return null;
}

async function writeVerdictCache(supabase: SupabaseClient, verdictKey: string, data: VerdictData): Promise<void> {
  try {
    await supabase
      .from("decision_verdicts")
      .upsert(
        { verdict_key: verdictKey, computed_on: new Date().toISOString().slice(0, 10), payload: data, updated_at: new Date().toISOString() },
        { onConflict: "verdict_key" },
      );
  } catch {
    /* table missing or write error — caching is best-effort, never fatal */
  }
}

// Convert a bundle of USD amounts to the display currency together, so they stay
// mutually consistent — and fall back to USD as a set if any rate is missing,
// rather than mixing currencies or inventing a number.
async function convertAll(
  displayCurrency: string,
  usd: { figure: number; valueThen: number; valueNow: number; benchmarkNow?: number },
): Promise<{ currency: string; figure: number; valueThen: number; valueNow: number; benchmarkNow?: number }> {
  if (!displayCurrency || displayCurrency === "USD") return { currency: "USD", ...usd };
  const conv = (v: number) => toDisplay(v, "USD", displayCurrency);
  const [figure, valueThen, valueNow, benchmarkNow] = await Promise.all([
    conv(usd.figure),
    conv(usd.valueThen),
    conv(usd.valueNow),
    usd.benchmarkNow != null ? conv(usd.benchmarkNow) : Promise.resolve(undefined),
  ]);
  // A rate was missing — keep the whole set in USD rather than mixing currencies.
  if (figure == null || valueThen == null || valueNow == null || (usd.benchmarkNow != null && benchmarkNow == null)) {
    return { currency: "USD", ...usd };
  }
  return {
    currency: displayCurrency,
    figure,
    valueThen,
    valueNow,
    ...(usd.benchmarkNow != null ? { benchmarkNow: benchmarkNow as number } : {}),
  };
}

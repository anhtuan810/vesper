import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchHistoricalSeries, normalizePrice } from "@/lib/prices";
import { normalizeCryptoSymbol } from "@/lib/symbol-aliases";
import { getUsdRates, getHistoricalUsdRates, historicalFxRate } from "@/lib/fx";
import {
  DIARY_MARKET_INDICES,
  MARKET_MOVE_LOOKBACK_DAYS,
  MARKET_MOVE_THRESHOLD_PCT,
  MARKET_SWING_EXPAND_FLOOR_PCT,
  MARKET_SWING_MAX_EXPANDED_PER_MONTH,
} from "@/lib/constants";

// One holding's contribution to a swing day's portfolio move, in the user's
// display currency.
export interface SwingHoldingImpact {
  symbol: string;
  label: string;
  impact: number; // signed, display currency
  pct: number;    // the holding's own day-over-day price move, %
}

// The computed effect of a market swing on THIS user's portfolio that day.
export interface SwingImpact {
  total: number;                    // net day-change across tradeables, display currency
  currency: string;                 // display currency
  movers: SwingHoldingImpact[];     // top movers by |impact|, largest first
}

export interface DiaryMarketMove {
  date: string; // YYYY-MM-DD
  index_symbol: string;
  index_label: string;
  pct_change: number;
  // Per-holding portfolio impact on this swing day (null when the user held no
  // priceable tradeables that day, or the day-change couldn't be computed).
  impact?: SwingImpact | null;
  // True when this swing is rendered as a full journal card (vs a compact row):
  // among the largest by |impact| in its month and above the floor.
  expanded?: boolean;
}

interface MoveRow {
  date: string;
  pct_change: number;
}

const DAY_MS = 86_400_000;
const TRADEABLE = new Set(["stocks", "etf", "crypto", "gold"]);

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return toDateStr(d);
}

// Computes signed daily % change vs the previous trading close, for each point
// after the first (which has no predecessor in the series).
function computeDailyPctChanges(series: { date: string; price: number }[]): MoveRow[] {
  const out: MoveRow[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].price;
    const cur = series[i].price;
    if (!prev) continue;
    out.push({ date: series[i].date, pct_change: ((cur - prev) / prev) * 100 });
  }
  return out;
}

async function ensureCachedMoves(
  supabase: SupabaseClient,
  symbol: string,
  spanFrom: string,
  spanTo: string,
): Promise<MoveRow[]> {
  const { data: cached } = await supabase
    .from("market_moves")
    .select("date, pct_change")
    .eq("index_symbol", symbol)
    .gte("date", spanFrom)
    .lte("date", spanTo)
    .order("date", { ascending: true });

  const cachedRows = (cached ?? []) as MoveRow[];
  const cachedDates = new Set(cachedRows.map((r) => r.date));

  // Cheap coverage check: do we have a row at (or near) both ends of the span?
  // A trading calendar has gaps (weekends/holidays), so require at least one
  // cached row within 5 days of each end rather than an exact-date match.
  const hasNear = (target: string) =>
    cachedRows.some((r) => Math.abs(new Date(r.date).getTime() - new Date(target).getTime()) <= 5 * DAY_MS);

  if (cachedRows.length > 0 && hasNear(spanFrom) && hasNear(spanTo)) {
    return cachedRows;
  }

  // Need a wider series than just the move dates: the first day of the span has
  // no predecessor close in [spanFrom, spanTo], so fetch one extra trading week back.
  const fetchFrom = addDays(spanFrom, -7);
  const series = await fetchHistoricalSeries(symbol, fetchFrom, spanTo);
  if (!series || series.length < 2) return cachedRows;

  const computed = computeDailyPctChanges(series).filter((r) => r.date >= spanFrom && r.date <= spanTo);
  if (computed.length === 0) return cachedRows;

  await supabase
    .from("market_moves")
    .upsert(
      computed.map((r) => ({ index_symbol: symbol, date: r.date, pct_change: r.pct_change })),
      { onConflict: "index_symbol,date" },
    );

  const merged = new Map<string, MoveRow>();
  for (const r of cachedRows) merged.set(r.date, r);
  for (const r of computed) merged.set(r.date, r);
  for (const d of cachedDates) merged.set(d, merged.get(d)!);
  return [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// Returns the most recent price on or before `date`, walking a sorted-ascending history.
function priceAtOrBefore(
  history: Array<{ date: string; price: number; currency: string }>,
  date: string,
): { price: number; currency: string } | null {
  let result: { price: number; currency: string } | null = null;
  for (const entry of history) {
    if (entry.date > date) break;
    result = { price: entry.price, currency: entry.currency };
  }
  return result;
}

// Units held as of `date`, walking a sorted-ascending unit timeline. 0 before
// the first event.
function unitsAtDate(timeline: Array<{ date: string; units: number }>, date: string): number {
  let units = 0;
  for (const entry of timeline) {
    if (entry.date > date) break;
    units = entry.units;
  }
  return units;
}

export interface SwingHolding {
  symbol: string;
  label: string;
  units: number;
  histKey: string; // key into the price-history map (crypto-normalized)
}

// Pure day-change attribution for one swing: for each holding, value on D minus
// value on the prior trading day P (same units, so it's pure price+FX move),
// in display currency via `toDisplay`. Returns the net total, the gross tradeable
// value on D (for the expand floor), and the movers sorted by |impact| desc.
// Exported and dependency-injected so the math is unit-testable without network.
export function computeSwingDayChange(
  date: string,
  prior: string,
  holdings: SwingHolding[],
  histMap: Map<string, Array<{ date: string; price: number; currency: string }>>,
  toDisplay: (amount: number, cur: string, date: string) => number | null,
): { total: number; tradeableValue: number; movers: SwingHoldingImpact[] } {
  let total = 0;
  let tradeableValue = 0;
  const movers: SwingHoldingImpact[] = [];
  for (const h of holdings) {
    if (h.units <= 0) continue;
    const hist = histMap.get(h.histKey);
    if (!hist) continue;
    const peD = priceAtOrBefore(hist, date);
    const peP = priceAtOrBefore(hist, prior);
    if (!peD || !peP) continue;
    const curD = peD.currency === "GBp" ? "GBP" : peD.currency;
    const curP = peP.currency === "GBp" ? "GBP" : peP.currency;
    const normD = normalizePrice(peD.price, peD.currency);
    const normP = normalizePrice(peP.price, peP.currency);
    const valD = toDisplay(normD * h.units, curD, date);
    const valP = toDisplay(normP * h.units, curP, prior);
    if (valD == null || valP == null) continue;
    const impact = valD - valP;
    tradeableValue += Math.abs(valD);
    total += impact;
    movers.push({ symbol: h.symbol, label: h.label, impact, pct: normP ? ((normD - normP) / normP) * 100 : 0 });
  }
  movers.sort((x, y) => Math.abs(y.impact) - Math.abs(x.impact));
  return { total, tradeableValue, movers };
}

interface AssetRow {
  id: string;
  type: string;
  symbol: string | null;
  name: string | null;
  currency: string | null;
  units: number | null;
  created_at: string;
  removed_at: string | null;
}

// Builds the user's market-swing journal entries: every big index swing in the
// lookback, enriched with how the user's holdings moved that day (real numbers,
// display currency). The largest few per month are flagged `expanded` (full
// card); the rest stay compact rows.
export async function getDiaryMarketMoves(userId: string, supabase: SupabaseClient): Promise<DiaryMarketMove[]> {
  const today = toDateStr(new Date());
  const lookbackCutoff = toDateStr(new Date(Date.now() - MARKET_MOVE_LOOKBACK_DAYS * DAY_MS));

  // Display currency drives every number shown.
  const { data: userRow } = await supabase
    .from("users").select("display_currency").eq("id", userId).maybeSingle();
  const displayCurrency = ((userRow?.display_currency as string | null) || "EUR").toUpperCase();

  // Holdings + their unit timelines (so we know units held on any past date).
  const { data: assetRows } = await supabase
    .from("assets")
    .select("id, type, symbol, name, currency, units, created_at, removed_at")
    .eq("user_id", userId);
  const assets = (assetRows ?? []) as AssetRow[];
  const tradeables = assets.filter((a) => TRADEABLE.has(a.type) && a.symbol);
  if (tradeables.length === 0) return [];

  const { data: mutationRows } = await supabase
    .from("mutations")
    .select("asset_id, action, after_units, occurred_at, recorded_at")
    .eq("user_id", userId)
    .not("asset_id", "is", null);

  const timelineByAsset = new Map<string, Array<{ date: string; units: number; seq: string }>>();
  for (const m of mutationRows ?? []) {
    const assetId = m.asset_id as string;
    const afterUnits = m.action === "remove" ? 0 : (m.after_units as number | null);
    if (afterUnits === null) continue;
    const date = (m.occurred_at as string | null)?.slice(0, 10) ?? lookbackCutoff;
    const seq = (m.recorded_at as string | null) ?? "";
    (timelineByAsset.get(assetId) ?? timelineByAsset.set(assetId, []).get(assetId)!).push({ date, units: afterUnits, seq });
  }
  for (const t of timelineByAsset.values()) {
    t.sort((a, b) => a.date.localeCompare(b.date) || a.seq.localeCompare(b.seq));
  }

  // Units held by an asset on a given date — from its mutation timeline, or
  // (for an asset with no unit mutations) its current units gated by acquisition
  // and sale dates.
  const unitsOf = (asset: AssetRow, date: string): number => {
    const timeline = timelineByAsset.get(asset.id);
    if (timeline && timeline.length > 0) return unitsAtDate(timeline, date);
    if (asset.removed_at && date >= asset.removed_at.slice(0, 10)) return 0;
    if (date < asset.created_at.slice(0, 10)) return 0;
    return asset.units ?? 0;
  };

  // ── Detect every big swing in the lookback (dedup by date, largest wins) ──
  const swings = new Map<string, { index_symbol: string; index_label: string; pct_change: number; prior: string | null }>();
  for (const { symbol, label } of DIARY_MARKET_INDICES) {
    const rows = await ensureCachedMoves(supabase, symbol, lookbackCutoff, today);
    const dates = rows.map((r) => r.date);
    for (let i = 0; i < rows.length; i++) {
      const pct = rows[i].pct_change;
      if (Math.abs(pct) < MARKET_MOVE_THRESHOLD_PCT) continue;
      const date = rows[i].date;
      const existing = swings.get(date);
      if (!existing || Math.abs(pct) > Math.abs(existing.pct_change)) {
        swings.set(date, { index_symbol: symbol, index_label: label, pct_change: pct, prior: i > 0 ? dates[i - 1] : null });
      }
    }
  }
  if (swings.size === 0) return [];

  // ── Price history per held symbol + historical FX, fetched once ──
  const symbolByNorm = new Map<string, { norm: string; raw: string }>();
  for (const a of tradeables) {
    const norm = normalizeCryptoSymbol(a.symbol!, a.type);
    symbolByNorm.set(norm, { norm, raw: a.symbol! });
  }
  const histMap = new Map<string, Array<{ date: string; price: number; currency: string }>>();
  await Promise.all(
    [...symbolByNorm.values()].map(async ({ norm }) => {
      const series = await fetchHistoricalSeries(norm, addDays(lookbackCutoff, -7), today);
      if (series && series.length > 0) histMap.set(norm, series);
    }),
  );

  const liveFx = await getUsdRates();
  const fxSeries = await getHistoricalUsdRates(lookbackCutoff, today);
  const fxDates = Object.keys(fxSeries).sort();
  const rateCache = new Map<string, number | null>();
  const rateOf = (date: string, cur: string): number | null => {
    if (cur === "USD") return 1;
    const key = `${date}|${cur}`;
    const hit = rateCache.get(key);
    if (hit !== undefined) return hit;
    const r = historicalFxRate(fxSeries, fxDates, date, cur, liveFx);
    rateCache.set(key, r);
    return r;
  };
  // Convert a native amount to the display currency at the historical rate for
  // `date` (price move and FX move both real — the value in display ccy on D vs P).
  const toDisplay = (amount: number, cur: string, date: string): number | null => {
    if (cur === displayCurrency) return amount;
    const rFrom = rateOf(date, cur);
    const rTo = rateOf(date, displayCurrency);
    if (rFrom == null || rTo == null) return null;
    return amount * (rTo / rFrom);
  };

  // ── Compute per-swing portfolio impact ──
  type Built = { move: DiaryMarketMove; total: number; tradeableValue: number; month: string };
  const built: Built[] = [];
  for (const [date, s] of swings) {
    const base: DiaryMarketMove = {
      date, index_symbol: s.index_symbol, index_label: s.index_label, pct_change: s.pct_change, impact: null, expanded: false,
    };
    const P = s.prior;
    if (!P) { built.push({ move: base, total: 0, tradeableValue: 0, month: date.slice(0, 7) }); continue; }

    const holdings: SwingHolding[] = tradeables.map((a) => ({
      symbol: a.symbol!, label: a.name || a.symbol!, units: unitsOf(a, date), histKey: normalizeCryptoSymbol(a.symbol!, a.type),
    }));
    const { total, tradeableValue, movers } = computeSwingDayChange(date, P, holdings, histMap, toDisplay);

    if (movers.length > 0) {
      base.impact = { total, currency: displayCurrency, movers: movers.slice(0, 3) };
    }
    built.push({ move: base, total, tradeableValue, month: date.slice(0, 7) });
  }

  // ── Expand the largest few per month (above the floor) ──
  const byMonth = new Map<string, Built[]>();
  for (const b of built) {
    if (!b.move.impact) continue;
    (byMonth.get(b.month) ?? byMonth.set(b.month, []).get(b.month)!).push(b);
  }
  for (const list of byMonth.values()) {
    list.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    let expandedCount = 0;
    for (const b of list) {
      if (expandedCount >= MARKET_SWING_MAX_EXPANDED_PER_MONTH) break;
      const floor = (b.tradeableValue * MARKET_SWING_EXPAND_FLOOR_PCT) / 100;
      if (Math.abs(b.total) >= floor && Math.abs(b.total) > 0) {
        b.move.expanded = true;
        expandedCount++;
      }
    }
  }

  return built.map((b) => b.move).sort((a, b) => b.date.localeCompare(a.date));
}

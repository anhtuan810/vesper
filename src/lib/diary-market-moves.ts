import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase";
import { fetchHistoricalSeries, normalizePrice } from "@/lib/prices";
import { normalizeCryptoSymbol } from "@/lib/symbol-aliases";
import { getUsdRates, getHistoricalUsdRates, historicalFxRate } from "@/lib/fx";
import {
  DIARY_MARKET_INDICES,
  MARKET_MOVE_LOOKBACK_DAYS,
  MARKET_MOVE_MAX_LOOKBACK_DAYS,
  MARKET_MOVE_THRESHOLD_PCT,
  MARKET_SWING_EXPAND_FLOOR_PCT,
  MARKET_SWING_MAX_EXPANDED_PER_MONTH,
  MARKET_SWING_MAX_PER_MONTH,
} from "@/lib/constants";

// One holding's contribution to a swing day's portfolio move, in the user's
// display currency.
export interface SwingHoldingImpact {
  symbol: string;
  label: string;
  impact: number; // signed, display currency
  pct: number;    // the holding's own day-over-day price move, %
  assetId?: string; // the holding's asset id, for deep-linking to its detail page
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
// Days of index/price/FX history fetched BEFORE the lookback window, so the
// earliest in-window swing can be valued against its true prior trading day
// (trading gaps mean the prior close can be several calendar days earlier).
const SWING_PRIOR_BUFFER_DAYS = 14;

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

// A per-index daily-move series. `rows` is sorted ascending and MAY include a few
// rows dated before the lookback window — kept only so the earliest in-window
// swing has a real prior trading day to value against.
export interface IndexMoveSeries {
  symbol: string;
  label: string;
  rows: MoveRow[];
}

// Detects big index swings within [lookbackCutoff, today], deduped by date across
// indices (largest |move| wins). Pre-cutoff rows are skipped for DETECTION but
// still serve as the `prior` for the first in-window swing — previously that
// swing sat at index 0 with prior=null and was dropped even though its real prior
// close existed in the fetched series. Pure + exported for unit testing.
export function detectSwings(
  seriesByIndex: IndexMoveSeries[],
  lookbackCutoff: string,
  thresholdPct: number,
): Map<string, { index_symbol: string; index_label: string; pct_change: number; prior: string | null }> {
  const swings = new Map<string, { index_symbol: string; index_label: string; pct_change: number; prior: string | null }>();
  for (const { symbol, label, rows } of seriesByIndex) {
    const dates = rows.map((r) => r.date);
    for (let i = 0; i < rows.length; i++) {
      const date = rows[i].date;
      if (date < lookbackCutoff) continue; // pre-window row: kept only to serve as a prior
      const pct = rows[i].pct_change;
      if (Math.abs(pct) < thresholdPct) continue;
      const existing = swings.get(date);
      if (!existing || Math.abs(pct) > Math.abs(existing.pct_change)) {
        swings.set(date, { index_symbol: symbol, index_label: label, pct_change: pct, prior: i > 0 ? dates[i - 1] : null });
      }
    }
  }
  return swings;
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
  assetId?: string;
}

// Pure day-change attribution for one swing: for each holding, value on D minus
// value on the prior trading day P at a FIXED unit count (so it's pure price+FX
// move), in display currency via `toDisplay`. The caller passes the units held
// as of P — the exposure that actually rode the P→D move — so a position bought
// on D contributes 0 and one sold on D still counts. Returns the net total, the
// gross tradeable value on D (for the expand floor), and the movers sorted by
// |impact| desc. Exported and dependency-injected so the math is unit-testable
// without network.
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
    movers.push({ symbol: h.symbol, label: h.label, impact, pct: normP ? ((normD - normP) / normP) * 100 : 0, assetId: h.assetId });
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
  buy_date: string | null;
  created_at: string;
  removed_at: string | null;
}

// Builds the user's market-swing journal entries: every big index swing in the
// lookback, enriched with how the user's holdings moved that day (real numbers,
// display currency). The largest few per month are flagged `expanded` (full
// card); the rest stay compact rows.
export async function getDiaryMarketMoves(userId: string, supabase: SupabaseClient): Promise<DiaryMarketMove[]> {
  const today = toDateStr(new Date());

  // Display currency drives every number shown.
  const { data: userRow } = await supabase
    .from("users").select("display_currency").eq("id", userId).maybeSingle();
  const displayCurrency = ((userRow?.display_currency as string | null) || "EUR").toUpperCase();

  // Holdings + their unit timelines (so we know units held on any past date).
  const { data: assetRows } = await supabase
    .from("assets")
    .select("id, type, symbol, name, currency, units, buy_date, created_at, removed_at")
    .eq("user_id", userId);
  const assets = (assetRows ?? []) as AssetRow[];
  const tradeables = assets.filter((a) => TRADEABLE.has(a.type) && a.symbol);
  if (tradeables.length === 0) return [];

  const { data: mutationRows } = await supabase
    .from("mutations")
    .select("asset_id, action, after_units, occurred_at, recorded_at")
    .eq("user_id", userId)
    .not("asset_id", "is", null);

  // Widen the swing-detection window back to the earliest holding, so a position
  // bought years ago surfaces market events across its whole held period —
  // matching the net-worth line, which backfills to the buy date — instead of a
  // fixed trailing year. The earliest hold date is each tradeable's own add
  // mutation occurred_at (= its buy date), with buy_date/created_at as fallbacks.
  // Clamped to MARKET_MOVE_MAX_LOOKBACK_DAYS to bound the index/price/FX history
  // fetched below (the swing query, price fetch and FX series all key off this).
  const tradeableIds = new Set(tradeables.map((a) => a.id));
  let earliestHeld = today;
  for (const a of tradeables) {
    const anchor = (a.buy_date ?? a.created_at)?.slice(0, 10);
    if (anchor && anchor < earliestHeld) earliestHeld = anchor;
  }
  for (const m of mutationRows ?? []) {
    if (!tradeableIds.has(m.asset_id as string)) continue;
    const d = (m.occurred_at as string | null)?.slice(0, 10);
    if (d && d < earliestHeld) earliestHeld = d;
  }
  const fixedCutoff = toDateStr(new Date(Date.now() - MARKET_MOVE_LOOKBACK_DAYS * DAY_MS));
  const maxCutoff = toDateStr(new Date(Date.now() - MARKET_MOVE_MAX_LOOKBACK_DAYS * DAY_MS));
  const lookbackCutoff = earliestHeld < fixedCutoff
    ? (earliestHeld < maxCutoff ? maxCutoff : earliestHeld)
    : fixedCutoff;

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
    // Gate on the real acquisition date, not the row's insert time, so a holding
    // logged long after purchase still counts as held back to its buy date.
    const acquired = (asset.buy_date ?? asset.created_at).slice(0, 10);
    if (date < acquired) return 0;
    return asset.units ?? 0;
  };

  // ── Detect every big swing in the lookback (dedup by date, largest wins) ──
  // Fetch a small buffer of rows BEFORE the window so the earliest in-window swing
  // has a real prior trading day (otherwise it was dropped with prior=null).
  const detectFrom = addDays(lookbackCutoff, -SWING_PRIOR_BUFFER_DAYS);
  const seriesByIndex: IndexMoveSeries[] = [];
  for (const { symbol, label } of DIARY_MARKET_INDICES) {
    const rows = await ensureCachedMoves(supabase, symbol, detectFrom, today);
    seriesByIndex.push({ symbol, label, rows });
  }
  const swings = detectSwings(seriesByIndex, lookbackCutoff, MARKET_MOVE_THRESHOLD_PCT);
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
      // Cover the prior-day buffer too (plus a trading-week margin), so a swing on
      // the first in-window day can price its holdings on the prior close.
      const series = await fetchHistoricalSeries(norm, addDays(lookbackCutoff, -(SWING_PRIOR_BUFFER_DAYS + 7)), today);
      if (series && series.length > 0) histMap.set(norm, series);
    }),
  );

  const liveFx = await getUsdRates();
  const fxSeries = await getHistoricalUsdRates(addDays(lookbackCutoff, -SWING_PRIOR_BUFFER_DAYS), today);
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
    if (!rFrom || !rTo) return null; // falsy guard catches null / 0 / NaN (matches convertCurrency)
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

    // Value the move with the units held at the START of the swing day — i.e. as
    // of the prior trading day P, the exposure that actually rode the P→D price
    // move. Using D's end-of-day units attributed a full day's move to shares
    // BOUGHT that day (a dip-buy showed as "your portfolio lost €X"), and dropped
    // a position SOLD that day (D units = 0) whose loss the user really took.
    const holdings: SwingHolding[] = tradeables.map((a) => ({
      symbol: a.symbol!, label: a.name || a.symbol!, units: unitsOf(a, P), histKey: normalizeCryptoSymbol(a.symbol!, a.type), assetId: a.id,
    }));
    const { total, tradeableValue, movers } = computeSwingDayChange(date, P, holdings, histMap, toDisplay);

    if (movers.length > 0) {
      base.impact = { total, currency: displayCurrency, movers: movers.slice(0, 3) };
    }
    built.push({ move: base, total, tradeableValue, month: date.slice(0, 7) });
  }

  // ── Keep only swings that actually moved the portfolio above the floor, then
  // cap per month (largest |impact| first): the top few become full cards, the
  // next few stay compact, the rest are dropped. This bounds the journal on every
  // surface — a volatile year can't flood it with rows the user never acted on. ──
  const byMonth = new Map<string, Built[]>();
  for (const b of built) {
    if (!b.move.impact) continue; // no priceable holdings that day → not "a swing that moved you"
    const floor = (b.tradeableValue * MARKET_SWING_EXPAND_FLOOR_PCT) / 100;
    if (Math.abs(b.total) < floor || Math.abs(b.total) === 0) continue; // negligible personal impact
    (byMonth.get(b.month) ?? byMonth.set(b.month, []).get(b.month)!).push(b);
  }

  const kept: DiaryMarketMove[] = [];
  for (const list of byMonth.values()) {
    list.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    list.slice(0, MARKET_SWING_MAX_PER_MONTH).forEach((b, i) => {
      b.move.expanded = i < MARKET_SWING_MAX_EXPANDED_PER_MONTH;
      kept.push(b.move);
    });
  }

  return kept.sort((a, b) => b.date.localeCompare(a.date));
}

// ── Persistence: generated in the background, read instantly ─────────────────

// Reads the precomputed swings for a user. Returns [] when none are stored yet
// or the table is unavailable (e.g. before the migration is applied) — the
// caller then falls back to computing at request time.
export async function getStoredMarketSwings(userId: string, supabase: SupabaseClient): Promise<DiaryMarketMove[]> {
  try {
    const { data, error } = await supabase
      .from("market_swings")
      .select("date, index_symbol, index_label, pct_change, total, currency, movers, expanded")
      .eq("user_id", userId)
      .order("date", { ascending: false });
    if (error || !data) return [];
    const moves: DiaryMarketMove[] = data.map((r) => ({
      date: r.date as string,
      index_symbol: r.index_symbol as string,
      index_label: r.index_label as string,
      pct_change: Number(r.pct_change),
      impact: { total: Number(r.total), currency: r.currency as string, movers: (r.movers as SwingHoldingImpact[]) ?? [] },
      expanded: Boolean(r.expanded),
    }));
    // Backfill mover assetIds for rows stored before the field existed, by mapping
    // each mover's symbol to the user's current asset — so the chips deep-link.
    return fillMoverAssetIds(moves, userId, supabase);
  } catch {
    return [];
  }
}

// Fills missing mover.assetId from the user's current tradeable assets (symbol →
// id). A no-op when every mover already carries an assetId.
async function fillMoverAssetIds(moves: DiaryMarketMove[], userId: string, supabase: SupabaseClient): Promise<DiaryMarketMove[]> {
  const needs = moves.some((mv) => mv.impact?.movers.some((h) => !h.assetId));
  if (!needs) return moves;
  const { data } = await supabase.from("assets").select("id, symbol, type").eq("user_id", userId);
  const bySymbol = new Map<string, string>();
  for (const a of data ?? []) {
    const sym = a.symbol as string | null;
    if (sym && TRADEABLE.has(a.type as string) && !bySymbol.has(sym)) bySymbol.set(sym, a.id as string);
  }
  for (const mv of moves) {
    if (!mv.impact) continue;
    for (const h of mv.impact.movers) {
      if (!h.assetId) { const id = bySymbol.get(h.symbol); if (id) h.assetId = id; }
    }
  }
  return moves;
}

// Idempotent full-replace of a user's stored swings: a single data edit (e.g.
// logging an asset bought years ago) can shift impacts across the whole history,
// so the entire set is recomputed and swapped.
async function replaceStoredSwings(userId: string, moves: DiaryMarketMove[], supabase: SupabaseClient): Promise<void> {
  const withImpact = moves.filter((mv) => mv.impact);
  const { error: delErr } = await supabase.from("market_swings").delete().eq("user_id", userId);
  if (delErr) throw delErr;
  if (withImpact.length === 0) return;
  const { error: insErr } = await supabase.from("market_swings").insert(
    withImpact.map((mv) => ({
      user_id: userId,
      date: mv.date,
      index_symbol: mv.index_symbol,
      index_label: mv.index_label,
      pct_change: mv.pct_change,
      total: mv.impact!.total,
      currency: mv.impact!.currency,
      movers: mv.impact!.movers,
      expanded: mv.expanded ?? false,
    })),
  );
  if (insErr) throw insErr;
}

async function reportSwingError(err: unknown): Promise<void> {
  // Non-fatal: the table may not exist yet (migration not applied) or a transient
  // failure — the read path falls back to request-time computation either way.
  if (process.env.SENTRY_DSN) {
    try { const S = await import("@sentry/nextjs"); S.captureException(err, { tags: { fn: "generateMarketSwings" } }); } catch {}
  }
}

// Computes the user's market swings from live data and replaces their stored set.
// Meant to run in the background (Next `after()` on data entry, and the daily
// cron) so the user never waits.
export async function generateMarketSwings(userId: string): Promise<void> {
  try {
    const supabase = createServerSupabase();
    const moves = await getDiaryMarketMoves(userId, supabase);
    await replaceStoredSwings(userId, moves, supabase);
  } catch (err) {
    await reportSwingError(err);
  }
}

// Persists swings the caller already computed (e.g. the read path warming the
// cache after a cold compute), avoiding a second computation.
export async function storeMarketSwings(userId: string, moves: DiaryMarketMove[]): Promise<void> {
  try {
    await replaceStoredSwings(userId, moves, createServerSupabase());
  } catch (err) {
    await reportSwingError(err);
  }
}

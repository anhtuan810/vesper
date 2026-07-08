import { createServerSupabase } from "@/lib/supabase";
import { fetchHistoricalSeries, type HistoricalSeriesPoint } from "@/lib/prices";

// A global, cross-instance cache of daily closing prices per symbol, backed by the
// `price_history` table. The warm-instance memo in snapshot.ts only survives while a
// serverless instance stays warm (~12h at most, and cold on a fresh instance); this
// cache persists the multi-year history so the expensive first-add backfill / rewind
// / diary computation fetch a symbol's deep history from Yahoo ONCE, ever, and only
// re-fetch the most recent few days (whose closes are still settling).
//
// Everything here is best-effort: any DB error (most importantly, the table not yet
// existing before the migration is applied) degrades to a plain live Yahoo fetch, so
// this is safe to deploy ahead of the SQL.

// Days at the tail of the range that are always re-fetched live rather than trusted
// from the cache — a symbol's most recent close is only final after the trading day
// settles, and Yahoo's last daily candle can be provisional intraday. Everything
// older is immutable and served straight from the cache.
const LIVE_TAIL_DAYS = 5;
// Coverage heuristic: a trading calendar has weekend/holiday gaps, so "covered near
// date X" means a cached row within this many days of X (mirrors ensureCachedMoves).
const NEAR_DAYS = 5;
const DAY_MS = 86_400_000;

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function hasNear(sortedDates: string[], target: string): boolean {
  const t = new Date(target + "T00:00:00Z").getTime();
  return sortedDates.some((d) => Math.abs(new Date(d + "T00:00:00Z").getTime() - t) <= NEAR_DAYS * DAY_MS);
}

export interface PriceFetchPlan {
  // The Yahoo span to fetch, or null when the cache fully covers the request.
  fetchFrom: string | null;
  fetchTo: string | null;
  // Merge cached rows strictly before this date with the freshly fetched tail; null
  // means don't trust any cached row (fetch replaces the whole range).
  useCacheBefore: string | null;
}

// Pure planner (exported for testing): given the dates already in the cache for a
// symbol and the requested [from, to] window, decide what — if anything — to fetch
// live and how much of the cache to reuse. The deep history (< today − LIVE_TAIL_DAYS)
// is served from the cache when covered; the recent tail is always re-fetched.
export function planPriceFetch(
  cachedDates: string[],
  from: string,
  to: string,
  today: string,
): PriceFetchPlan {
  const sorted = [...cachedDates].sort();
  const liveCutoff = addDays(today, -LIVE_TAIL_DAYS);

  // The portion of the request that is "settled" (immutable) history.
  const settledEnd = to < liveCutoff ? to : liveCutoff;
  const settledCovered =
    sorted.length > 0 &&
    hasNear(sorted, from) &&
    (settledEnd <= from || hasNear(sorted, settledEnd));

  // Cache can't serve the settled history → fetch the whole range fresh.
  if (!settledCovered) {
    return { fetchFrom: from, fetchTo: to, useCacheBefore: null };
  }

  // Settled history is covered. If the request ends before the live tail, the cache
  // covers everything — no fetch at all.
  if (to < liveCutoff) {
    return { fetchFrom: null, fetchTo: null, useCacheBefore: null };
  }

  // Otherwise fetch only the recent tail (with a small margin so its first day has a
  // predecessor close) and splice it onto the cached settled history.
  const tailFrom = addDays(liveCutoff, -7);
  return {
    fetchFrom: from > tailFrom ? from : tailFrom,
    fetchTo: to,
    useCacheBefore: liveCutoff,
  };
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// DB-backed daily price series for [from, to]. Returns rows sorted ascending, or null
// when neither the cache nor a live fetch can produce anything. Callers that want the
// warm in-process memo on top of this should wrap it (snapshot.ts does).
export async function getCachedPriceSeries(
  symbol: string,
  from: string,
  to: string,
): Promise<HistoricalSeriesPoint[] | null> {
  const today = todayStr();
  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("price_history")
      .select("date, price, currency")
      .eq("symbol", symbol)
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true });
    // Table missing (pre-migration) or any read error → fall back to a live fetch.
    if (error) return await fetchHistoricalSeries(symbol, from, to);

    const cached: HistoricalSeriesPoint[] = (data ?? []).map((r) => ({
      date: r.date as string,
      price: Number(r.price),
      currency: r.currency as string,
    }));
    const plan = planPriceFetch(cached.map((r) => r.date), from, to, today);

    // Fully covered by the cache — no network at all.
    if (!plan.fetchFrom || !plan.fetchTo) return cached;

    const fetched = await fetchHistoricalSeries(symbol, plan.fetchFrom, plan.fetchTo);
    if (!fetched || fetched.length === 0) {
      // Live fetch failed: serve whatever the cache held (better than nothing).
      return cached.length > 0 ? cached : null;
    }

    // Persist the freshly fetched rows (best-effort; a write failure is non-fatal).
    try {
      await supabase
        .from("price_history")
        .upsert(
          fetched.map((r) => ({ symbol, date: r.date, price: r.price, currency: r.currency })),
          { onConflict: "symbol,date" },
        );
    } catch {
      /* cache write is best-effort */
    }

    // Merge cached settled history (< useCacheBefore) with the fetched tail.
    const merged = new Map<string, HistoricalSeriesPoint>();
    if (plan.useCacheBefore) {
      for (const r of cached) if (r.date < plan.useCacheBefore) merged.set(r.date, r);
    }
    for (const r of fetched) merged.set(r.date, r);
    return [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    // Any unexpected failure (e.g. the table absent) → plain live fetch.
    return await fetchHistoricalSeries(symbol, from, to);
  }
}

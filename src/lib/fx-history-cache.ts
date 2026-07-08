import { createServerSupabase } from "@/lib/supabase";
import { getHistoricalUsdRates, type FxSeries } from "@/lib/fx";
import { planPriceFetch } from "@/lib/price-history-cache";

// A global, cross-instance cache of per-date USD→quote FX rates, backed by the
// `fx_rate_history` table. `getHistoricalUsdRates` only memoises in-process by exact
// range, so the net-worth backfill and the Diary swing computation — which request
// different (multi-year) ranges and run on cold instances after a first add — each
// re-fetch the whole series from Frankfurter. This persists the immutable history so
// only the recent, still-settling tail is ever re-fetched, and shares it across both
// rebuilds and all instances.
//
// Mirrors price-history-cache exactly, down to reusing its `planPriceFetch` planner
// (dates are dates). Best-effort throughout: any DB error — most importantly the table
// not existing before the migration is applied — degrades to a plain live Frankfurter
// fetch, so this is safe to deploy ahead of the SQL.

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// DB-backed per-date USD FX series for [from, to]. Same shape as
// getHistoricalUsdRates; returns {} only when neither cache nor live fetch yields
// anything (callers then fall back to the live single-day rate via historicalFxRate).
export async function getCachedHistoricalUsdRates(from: string, to: string): Promise<FxSeries> {
  const today = todayStr();
  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("fx_rate_history")
      .select("date, quote, rate")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true });
    // Table missing (pre-migration) or any read error → live fetch.
    if (error) return await getHistoricalUsdRates(from, to);

    const cached: FxSeries = {};
    for (const r of data ?? []) {
      const date = r.date as string;
      (cached[date] ??= {})[r.quote as string] = Number(r.rate);
    }

    const plan = planPriceFetch(Object.keys(cached), from, to, today);

    // Fully covered by the cache — no network at all.
    if (!plan.fetchFrom || !plan.fetchTo) return cached;

    const fetched = await getHistoricalUsdRates(plan.fetchFrom, plan.fetchTo);
    if (Object.keys(fetched).length === 0) {
      // Live fetch failed/empty: serve whatever the cache held.
      return cached;
    }

    // Persist the freshly fetched rows (best-effort).
    const rows: { date: string; quote: string; rate: number }[] = [];
    for (const [date, quotes] of Object.entries(fetched)) {
      for (const [quote, rate] of Object.entries(quotes)) rows.push({ date, quote, rate });
    }
    if (rows.length > 0) {
      try {
        await supabase.from("fx_rate_history").upsert(rows, { onConflict: "date,quote" });
      } catch {
        /* cache write is best-effort */
      }
    }

    // Merge cached settled history (< useCacheBefore) with the fetched tail.
    const merged: FxSeries = {};
    if (plan.useCacheBefore) {
      for (const [date, quotes] of Object.entries(cached)) {
        if (date < plan.useCacheBefore) merged[date] = { ...quotes };
      }
    }
    for (const [date, quotes] of Object.entries(fetched)) {
      merged[date] = { ...(merged[date] ?? {}), ...quotes };
    }
    return merged;
  } catch {
    return await getHistoricalUsdRates(from, to);
  }
}

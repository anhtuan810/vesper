// Cached adapters for the modeled-history reconstruction engine. Monthly
// granularity throughout — the modeled region never needs daily resolution,
// and fetching daily history for multi-year ranges would be wasteful and
// rate-limit-unfriendly. Each adapter degrades to a live fetch on cache miss
// and is best-effort on writes (a failed upsert never breaks the read path).
//
// CBS regional index reuses the existing `price_index_cache` (see cbs-pbk.ts)
// — it already caches one full yearly series per region, which is exactly the
// "one fetch per region" shape this engine needs. No new CBS table.

import { createServerSupabase } from "@/lib/supabase";
import { fetchHistoricalPrice, normalizePrice } from "./prices";
import { getHistoricalUsdRates } from "./fx";

export interface MonthlyClose {
  price: number; // normalized to the listing currency (GBp -> GBP)
  currency: string;
}

// Cached monthly close for `symbol` at month-precision date `month` (YYYY-MM-01).
// Reads/writes historical_price_cache(symbol, month, close, currency).
export async function getMonthlyClose(symbol: string, month: string): Promise<MonthlyClose | null> {
  const supabase = createServerSupabase();

  try {
    const { data } = await supabase
      .from("historical_price_cache")
      .select("close, currency")
      .eq("symbol", symbol)
      .eq("month", month)
      .maybeSingle();
    if (data?.close != null) {
      return { price: Number(data.close), currency: String(data.currency ?? "USD") };
    }
  } catch {
    /* degrade to live fetch */
  }

  const fetched = await fetchHistoricalPrice(symbol, month);
  if (!fetched) return null;
  const price = normalizePrice(fetched.price, fetched.currency);
  const currency = fetched.currency === "GBp" ? "GBP" : fetched.currency;

  try {
    await supabase
      .from("historical_price_cache")
      .upsert({ symbol, month, close: price, currency }, { onConflict: "symbol,month" });
  } catch {
    /* best-effort */
  }

  return { price, currency };
}

// Monthly closes for `symbol` across the given months (each YYYY-MM-01),
// fetched one cached lookup at a time — Yahoo's ±4-day window in
// fetchHistoricalPrice already makes each call cheap and weekend/holiday-safe.
// Months with no resolvable close are simply absent from the result map.
export async function getMonthlyCloseSeries(
  symbol: string,
  months: string[],
): Promise<Map<string, MonthlyClose>> {
  const out = new Map<string, MonthlyClose>();
  for (const month of months) {
    const close = await getMonthlyClose(symbol, month);
    if (close) out.set(month, close);
  }
  return out;
}

// Monthly USD→`quote` rates for the given months (each YYYY-MM-01). Cache
// misses are filled with a SINGLE Frankfurter time-series call spanning the
// full [earliest, latest] missing range, downsampled to the nearest available
// date per month, then persisted to fx_rate_cache(month, base, quote, rate).
export async function getMonthlyFxRates(quote: string, months: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (months.length === 0) return out;
  if (quote === "USD") {
    for (const month of months) out.set(month, 1);
    return out;
  }

  const supabase = createServerSupabase();
  const missing: string[] = [];
  for (const month of months) {
    try {
      const { data } = await supabase
        .from("fx_rate_cache")
        .select("rate")
        .eq("month", month)
        .eq("base", "USD")
        .eq("quote", quote)
        .maybeSingle();
      if (data?.rate != null) {
        out.set(month, Number(data.rate));
        continue;
      }
    } catch {
      /* fall through to live fetch */
    }
    missing.push(month);
  }
  if (missing.length === 0) return out;

  const sorted = [...missing].sort();
  const series = await getHistoricalUsdRates(sorted[0], sorted[sorted.length - 1]);
  const dates = Object.keys(series).sort();
  if (dates.length === 0) return out;

  const upserts: Array<{ month: string; base: string; quote: string; rate: number }> = [];
  for (const month of missing) {
    const targetTs = new Date(month).getTime();
    let closest: string | null = null;
    let minDiff = Infinity;
    for (const d of dates) {
      const diff = Math.abs(new Date(d).getTime() - targetTs);
      if (diff < minDiff) {
        minDiff = diff;
        closest = d;
      }
    }
    const rate = closest ? series[closest]?.[quote] : undefined;
    if (rate == null) continue;
    out.set(month, rate);
    upserts.push({ month, base: "USD", quote, rate });
  }

  if (upserts.length > 0) {
    try {
      await supabase.from("fx_rate_cache").upsert(upserts, { onConflict: "month,base,quote" });
    } catch {
      /* best-effort */
    }
  }

  return out;
}

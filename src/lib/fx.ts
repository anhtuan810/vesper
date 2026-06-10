import * as Sentry from "@sentry/nextjs";
import { createServerSupabase } from "@/lib/supabase";
import {
  FRANKFURTER_URL,
  FETCH_TIMEOUT_MS,
  FX_STALE_AFTER_MS,
  FX_MEM_CACHE_TTL_MS,
  USD_FALLBACK_RATES,
} from "@/lib/constants";
import { convertCurrency } from "@/lib/currency-convert";

export interface FxRates {
  [quote: string]: number; // rate: 1 USD = N quote
}

// In-process cache so a burst of price fetches in one request cycle shares one lookup
let memCache: { rates: FxRates; ts: number } | null = null;

export async function getUsdRates(): Promise<FxRates> {
  if (memCache && Date.now() - memCache.ts < FX_MEM_CACHE_TTL_MS) {
    return memCache.rates;
  }

  const supabase = createServerSupabase();

  // Check DB cache
  const { data: rows } = await supabase
    .from("fx_rates")
    .select("quote, rate, fetched_at")
    .eq("base", "USD");

  const now = Date.now();

  if (rows && rows.length > 0) {
    const oldestTs = Math.min(...rows.map((r) => new Date(r.fetched_at).getTime()));
    if (now - oldestTs < FX_STALE_AFTER_MS) {
      const rates: FxRates = {};
      for (const r of rows) rates[r.quote] = Number(r.rate);
      memCache = { rates, ts: now };
      return rates;
    }
  }

  // Fetch fresh rates
  let fresh: FxRates | null = null;
  try {
    const res = await fetch(FRANKFURTER_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`frankfurter HTTP ${res.status}`);
    const body = await res.json();
    const rawRates = body?.rates;
    if (!rawRates || typeof rawRates !== "object" || Array.isArray(rawRates)) {
      throw new Error("Unexpected Frankfurter response shape");
    }
    fresh = rawRates as FxRates;
  } catch (err) {
    // If API is unreachable but we have stale rows, return them rather than fail
    if (rows && rows.length > 0) {
      console.warn("FX refresh failed; using stale rates:", err);
      const rates: FxRates = {};
      for (const r of rows) rates[r.quote] = Number(r.rate);
      memCache = { rates, ts: now };
      return rates;
    }
    // Last resort: hardcoded approximate rates. Upsert with epoch zero so the
    // next request treats them as maximally stale and attempts a live refresh.
    Sentry.captureMessage("FX rates unavailable — using hardcoded fallback", "warning");
    console.warn("FX rates unavailable; using hardcoded fallback:", err);
    const fallbackRows = Object.entries(USD_FALLBACK_RATES).map(([quote, rate]) => ({
      base: "USD",
      quote,
      rate,
      fetched_at: new Date(0).toISOString(),
    }));
    await supabase.from("fx_rates").upsert(fallbackRows, { onConflict: "base,quote" });
    memCache = { rates: USD_FALLBACK_RATES, ts: now };
    return USD_FALLBACK_RATES;
  }

  // Upsert all pairs
  const upsertRows = Object.entries(fresh).map(([quote, rate]) => ({
    base: "USD",
    quote,
    rate,
    fetched_at: new Date().toISOString(),
  }));

  await supabase.from("fx_rates").upsert(upsertRows, { onConflict: "base,quote" });

  memCache = { rates: fresh, ts: now };
  return fresh;
}

// ── Historical FX (frankfurter time-series) ──────────────────────────────────
// Per-date USD rates for [from, to]. Fetch-on-demand, cached in-memory by range
// (same pattern as getUsdRates' memCache). No DB cache, no schema change.

const FRANKFURTER_TIMESERIES_BASE = "https://api.frankfurter.app";
const FX_SYMBOLS = "EUR,GBP,CHF,JPY,CAD,AUD,HKD";

/** date (YYYY-MM-DD) → { quote: rate } where rate = 1 USD = N quote. */
export interface FxSeries {
  [date: string]: FxRates;
}

const histMemCache = new Map<string, { series: FxSeries; ts: number }>();

export async function getHistoricalUsdRates(from: string, to: string): Promise<FxSeries> {
  const key = `${from}..${to}`;
  const cached = histMemCache.get(key);
  if (cached && Date.now() - cached.ts < FX_MEM_CACHE_TTL_MS) return cached.series;

  try {
    const url = `${FRANKFURTER_TIMESERIES_BASE}/${from}..${to}?base=USD&symbols=${FX_SYMBOLS}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS * 3) });
    if (!res.ok) throw new Error(`frankfurter timeseries HTTP ${res.status}`);
    const body = await res.json();
    const rates = body?.rates;
    if (!rates || typeof rates !== "object" || Array.isArray(rates)) {
      throw new Error("Unexpected Frankfurter timeseries response shape");
    }
    const series = rates as FxSeries;
    histMemCache.set(key, { series, ts: Date.now() });
    return series;
  } catch (err) {
    if (cached) return cached.series;
    Sentry.captureMessage("Historical FX unavailable", "warning");
    console.warn("Historical FX fetch failed:", err);
    return {};
  }
}

// Most recent real historical USD rate at or before `date` for `currency`,
// walking the Frankfurter time-series (which has gaps on weekends/holidays).
// Falls back to the current-day rate when the series has no entry at/before
// the date or doesn't cover the currency at all. Shared by the snapshot
// backfill (storage basis) and the snapshots API (so the client can convert
// each historical row at the SAME per-date rate it was stored with).
export function historicalFxRate(
  series: FxSeries,
  sortedDates: string[],
  date: string,
  currency: string,
  currentFx: Record<string, number>,
): number | null {
  if (currency === "USD") return 1;
  let result: number | null = null;
  for (const d of sortedDates) {
    if (d > date) break;
    const rate = series[d]?.[currency];
    if (rate != null) result = rate;
  }
  return result ?? currentFx[currency] ?? null;
}


// Cross-rate conversion using the live USD-based rates table. Identity
// short-circuit for from === to (no fetch needed). Returns null only if a
// needed rate is missing from the table.
export async function toDisplay(amount: number, from: string, to: string): Promise<number | null> {
  if (from === to) return amount;
  const rates = await getUsdRates();
  return convertCurrency(amount, from, to, rates);
}

// Returns null only when the FX table is empty AND the API is down.
export async function toUsd(amount: number, nativeCurrency: string): Promise<number | null> {
  // USD → USD is a no-op
  if (nativeCurrency === "USD") return amount;
  // GBp (pence) normalisation is handled upstream; treat GBp as GBP here
  const quote = nativeCurrency === "GBp" ? "GBP" : nativeCurrency;

  try {
    const rates = await getUsdRates();
    const rate = rates[quote];
    if (!rate) return null;
    // rate = how many `quote` per 1 USD → to get USD divide by rate
    return amount / rate;
  } catch {
    return null;
  }
}

import * as Sentry from "@sentry/nextjs";
import { createServerSupabase } from "@/lib/supabase";

const FRANKFURTER_URL =
  "https://api.frankfurter.app/latest?base=EUR&symbols=USD,GBP,CHF,JPY,CAD,AUD,HKD";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export interface FxRates {
  [quote: string]: number; // rate: 1 EUR = N quote
}

// Last reviewed: 2026. These drift over time; review annually.
const HARDCODED_FALLBACK_RATES: FxRates = {
  USD: 1.12,
  GBP: 0.85,
  CHF: 0.94,
  JPY: 160,
  CAD: 1.56,
  AUD: 1.75,
  HKD: 8.72,
};

// In-process cache so a burst of price fetches in one request cycle shares one lookup
let memCache: { rates: FxRates; ts: number } | null = null;

export async function getEurRates(): Promise<FxRates> {
  if (memCache && Date.now() - memCache.ts < 60_000) {
    return memCache.rates;
  }

  const supabase = createServerSupabase();

  // Check DB cache
  const { data: rows } = await supabase
    .from("fx_rates")
    .select("quote, rate, fetched_at")
    .eq("base", "EUR");

  const now = Date.now();

  if (rows && rows.length > 0) {
    const oldestTs = Math.min(...rows.map((r) => new Date(r.fetched_at).getTime()));
    if (now - oldestTs < STALE_AFTER_MS) {
      const rates: FxRates = {};
      for (const r of rows) rates[r.quote] = Number(r.rate);
      memCache = { rates, ts: now };
      return rates;
    }
  }

  // Fetch fresh rates
  let fresh: FxRates | null = null;
  try {
    const res = await fetch(FRANKFURTER_URL, { signal: AbortSignal.timeout(5000) });
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
    const fallbackRows = Object.entries(HARDCODED_FALLBACK_RATES).map(([quote, rate]) => ({
      base: "EUR",
      quote,
      rate,
      fetched_at: new Date(0).toISOString(),
    }));
    await supabase.from("fx_rates").upsert(fallbackRows, { onConflict: "base,quote" });
    memCache = { rates: HARDCODED_FALLBACK_RATES, ts: now };
    return HARDCODED_FALLBACK_RATES;
  }

  // Upsert all pairs
  const upsertRows = Object.entries(fresh).map(([quote, rate]) => ({
    base: "EUR",
    quote,
    rate,
    fetched_at: new Date().toISOString(),
  }));

  await supabase.from("fx_rates").upsert(upsertRows, { onConflict: "base,quote" });

  memCache = { rates: fresh, ts: now };
  return fresh;
}

// Converts a native-currency amount to EUR.
// Returns null only when the FX table is empty AND the API is down.
export async function toEur(amount: number, nativeCurrency: string): Promise<number | null> {
  // EUR → EUR is a no-op
  if (nativeCurrency === "EUR") return amount;
  // GBp (pence) normalisation is handled upstream; treat GBp as GBP here
  const quote = nativeCurrency === "GBp" ? "GBP" : nativeCurrency;

  try {
    const rates = await getEurRates();
    const rate = rates[quote];
    if (!rate) return null;
    // rate = how many `quote` per 1 EUR → to get EUR divide by rate
    return amount / rate;
  } catch {
    return null;
  }
}

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

const FRANKFURTER_URL =
  "https://api.frankfurter.app/latest?base=EUR&symbols=USD,GBP,CHF,JPY,CAD,AUD,HKD";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export interface FxRates {
  [quote: string]: number; // rate: 1 EUR = N quote
}

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
    fresh = body.rates as FxRates;
  } catch (err) {
    // If API is unreachable but we have stale rows, return them rather than fail
    if (rows && rows.length > 0) {
      console.warn("FX refresh failed; using stale rates:", err);
      const rates: FxRates = {};
      for (const r of rows) rates[r.quote] = Number(r.rate);
      memCache = { rates, ts: now };
      return rates;
    }
    // No stale fallback — surface the failure so callers know prices are unreliable
    throw new Error(`FX rates unavailable and no cached fallback: ${err}`);
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

// GET endpoint so it can be pinged to warm the cache (used by cron later)
export async function GET() {
  try {
    const rates = await getEurRates();
    return NextResponse.json({ base: "EUR", rates });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 503 });
  }
}

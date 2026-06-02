import { YAHOO_FINANCE_BASE_URL, FETCH_TIMEOUT_MS } from "@/lib/constants";

interface HistoricalPrice {
  price: number;
  currency: string;
}

export async function fetchHistoricalPrice(
  symbol: string,
  date: string | null
): Promise<HistoricalPrice | null> {
  try {
    let url: string;
    if (date) {
      const d = new Date(date);
      // Window ±4 days to catch weekends and holidays
      const period1 = Math.floor((d.getTime() - 4 * 86400_000) / 1000);
      const period2 = Math.floor((d.getTime() + 4 * 86400_000) / 1000);
      url = `${YAHOO_FINANCE_BASE_URL}/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`;
    } else {
      url = `${YAHOO_FINANCE_BASE_URL}/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const currency: string = result.meta?.currency || "USD";
    const timestamps: number[] = result.timestamp || [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];

    if (date) {
      const targetTs = new Date(date).getTime() / 1000;
      let closest: number | null = null;
      let minDiff = Infinity;
      timestamps.forEach((ts, i) => {
        const diff = Math.abs(ts - targetTs);
        if (diff < minDiff && closes[i] != null) {
          minDiff = diff;
          closest = closes[i];
        }
      });
      if (closest === null) return null;
      return { price: closest, currency };
    } else {
      const price = result.meta?.regularMarketPrice;
      if (!price) return null;
      return { price, currency };
    }
  } catch {
    return null;
  }
}

export interface HistoricalSeriesPoint {
  date: string; // YYYY-MM-DD
  price: number; // native currency close
  currency: string;
}

// Daily closing-price series for [from, to] (inclusive), sorted ascending by date.
// Additive — mirrors the Yahoo daily-series fetch already used by snapshot.ts.
export async function fetchHistoricalSeries(
  symbol: string,
  from: string,
  to: string,
): Promise<HistoricalSeriesPoint[] | null> {
  try {
    const period1 = Math.floor(new Date(from + "T00:00:00Z").getTime() / 1000);
    const period2 = Math.floor(new Date(to + "T23:59:59Z").getTime() / 1000);
    const url = `${YAHOO_FINANCE_BASE_URL}/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const currency: string = result.meta?.currency ?? "USD";
    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

    const out: HistoricalSeriesPoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] == null) continue;
      out.push({ date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10), price: closes[i]!, currency });
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  } catch {
    return null;
  }
}

export function normalizePrice(price: number, currency: string): number {
  return currency === "GBp" ? price / 100 : price;
}

export function priceAtDate(closes: number[], timestamps: number[], date: Date): number | null {
  if (closes.length === 0) return null;
  const targetTs = date.getTime() / 1000;
  let closest: number | null = null;
  let minDiff = Infinity;
  timestamps.forEach((ts, i) => {
    const diff = Math.abs(ts - targetTs);
    if (diff < minDiff) {
      minDiff = diff;
      closest = closes[i];
    }
  });
  return closest;
}

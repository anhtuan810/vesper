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
      // An unparseable date would make every period/diff NaN and silently return
      // a null match — bail explicitly instead so the caller knows the lookup
      // didn't run, rather than mistaking it for "no close on file".
      if (Number.isNaN(d.getTime())) return null;
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
      // Only accept a close within the ±4-day request window. Without this bound
      // a date the symbol has no data for (before its IPO, a long market gap, or
      // a future date) would still match the nearest available bar — fabricating
      // a "historical" price that is really today's or the listing-day close.
      const MAX_GAP_SEC = 4 * 86400;
      let closest: number | null = null;
      let minDiff = Infinity;
      timestamps.forEach((ts, i) => {
        const diff = Math.abs(ts - targetTs);
        if (diff < minDiff && closes[i] != null) {
          minDiff = diff;
          closest = closes[i];
        }
      });
      if (closest === null || minDiff > MAX_GAP_SEC) return null;
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

// Closing price on the last trading day of the given YYYY-MM month, or null
// when Yahoo has no data for that symbol/month (delisted, not yet listed,
// etc.). Used to auto-fill a cost basis when the user states an acquisition
// month but not a price — month-end is close enough to how people remember
// what they paid, and avoids a second "what price?" question.
export async function getMonthClosingPrice(
  symbol: string,
  yearMonth: string
): Promise<{ price: number; currency: string } | null> {
  const [year, month] = yearMonth.split("-").map(Number);
  if (!year || !month) return null;
  const from = `${yearMonth}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${yearMonth}-${String(lastDay).padStart(2, "0")}`;

  const series = await fetchHistoricalSeries(symbol, from, to);
  if (!series || series.length === 0) return null;

  const last = series[series.length - 1];
  const price = normalizePrice(last.price, last.currency);
  const currency = last.currency === "GBp" ? "GBP" : last.currency;
  return { price, currency };
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

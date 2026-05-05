export interface PriceResult {
  price: number;
  currency: string;
}

export async function fetchHistoricalPrice(
  symbol: string,
  date: string | null
): Promise<PriceResult | null> {
  try {
    let url: string;
    if (date) {
      const d = new Date(date);
      // Window ±4 days to catch weekends and holidays
      const period1 = Math.floor((d.getTime() - 4 * 86400_000) / 1000);
      const period2 = Math.floor((d.getTime() + 4 * 86400_000) / 1000);
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`;
    } else {
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
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

export function normalizePrice(price: number, currency: string): number {
  return currency === "GBp" ? price / 100 : price;
}

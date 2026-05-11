import { normalizePrice } from "@/lib/prices";
import { toEur } from "@/lib/fx";

// ── Price history ─────────────────────────────────────────────────────────────

export interface PricePoint {
  timestamp: number;
  close: number;
}

export const RANGE_PARAMS: Record<string, { interval: string; range: string }> = {
  "1D": { interval: "5m",  range: "1d"  },
  "1W": { interval: "1d",  range: "5d"  },
  "1M": { interval: "1d",  range: "1mo" },
  "3M": { interval: "1d",  range: "3mo" },
  "1Y": { interval: "1d",  range: "1y"  },
  "ALL": { interval: "1wk", range: "10y" },
};

const historyCache = new Map<string, { data: PricePoint[]; ts: number }>();
const HISTORY_CACHE_TTL = 5 * 60 * 1000;

export async function fetchHistory(symbol: string, range: string): Promise<PricePoint[]> {
  const key = `${symbol}_${range}`;
  const cached = historyCache.get(key);
  if (cached && Date.now() - cached.ts < HISTORY_CACHE_TTL) return cached.data;

  const params = RANGE_PARAMS[range] ?? RANGE_PARAMS["1W"];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${params.interval}&range=${params.range}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return [];

    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

    const data: PricePoint[] = timestamps
      .map((ts, i) => ({ timestamp: ts, close: closes[i] as number }))
      .filter((p) => p.close != null && !isNaN(p.close));

    historyCache.set(key, { data, ts: Date.now() });
    return data;
  } catch (err) {
    console.error("fetchHistory failed for", symbol, ":", err);
    return [];
  }
}

interface YahooResult {
  price: number;
  previousClose: number;
  nativeCurrency: string;
}

export interface PriceResult {
  symbol: string;
  price: number;          // EUR-converted
  previousClose: number;  // raw — used for % change only, no FX needed
  nativePrice: number;    // original Yahoo price in nativeCurrency
  nativeCurrency: string;
  error?: string;
}

const priceCache = new Map<string, { data: Omit<PriceResult, "symbol">; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function fetchYahooPrice(symbol: string): Promise<PriceResult> {
  const cached = priceCache.get(symbol);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { symbol, ...cached.data };
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;

    if (!meta) return { symbol, price: 0, previousClose: 0, nativePrice: 0, nativeCurrency: "", error: "not found" };

    const rawPrice = Number(meta.regularMarketPrice) || 0;
    const prevClose = Number(meta.chartPreviousClose || meta.previousClose) || 0;
    const yahooCurrency = typeof meta.currency === "string" ? meta.currency : "USD";

    const yahoo: YahooResult = {
      price: normalizePrice(rawPrice, yahooCurrency),
      previousClose: normalizePrice(prevClose, yahooCurrency),
      nativeCurrency: yahooCurrency === "GBp" ? "GBP" : yahooCurrency,
    };

    const [eurPrice, eurPrevClose] = await Promise.all([
      toEur(yahoo.price, yahoo.nativeCurrency),
      toEur(yahoo.previousClose, yahoo.nativeCurrency),
    ]);

    if (eurPrice === null) {
      // FX unavailable — return raw price so the app still shows something
      const result: Omit<PriceResult, "symbol"> = {
        price: yahoo.price,
        previousClose: yahoo.previousClose,
        nativePrice: yahoo.price,
        nativeCurrency: yahoo.nativeCurrency,
      };
      priceCache.set(symbol, { data: result, ts: Date.now() });
      return { symbol, ...result };
    }

    const result: Omit<PriceResult, "symbol"> = {
      price: eurPrice,
      previousClose: eurPrevClose ?? yahoo.previousClose,
      nativePrice: yahoo.price,
      nativeCurrency: yahoo.nativeCurrency,
    };
    priceCache.set(symbol, { data: result, ts: Date.now() });
    return { symbol, ...result };
  } catch {
    return { symbol, price: 0, previousClose: 0, nativePrice: 0, nativeCurrency: "", error: "fetch failed" };
  }
}

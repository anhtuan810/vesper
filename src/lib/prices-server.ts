import { normalizePrice } from "@/lib/prices";
import { YAHOO_FINANCE_BASE_URL, FETCH_TIMEOUT_MS, PRICE_CACHE_TTL_MS } from "@/lib/constants";
import { venuePriorityFor } from "@/lib/venues";
import { applyLivePrice } from "@/lib/live-pricing";

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
  "All": { interval: "1wk", range: "10y" },
  "3Y":  { interval: "1wk", range: "3y"  },
};

const historyCache = new Map<string, { data: PricePoint[]; ts: number }>();

export async function fetchHistory(symbol: string, range: string): Promise<PricePoint[]> {
  const key = `${symbol}_${range}`;
  const cached = historyCache.get(key);
  if (cached && Date.now() - cached.ts < PRICE_CACHE_TTL_MS) return cached.data;

  const params = RANGE_PARAMS[range] ?? RANGE_PARAMS["1W"];
  const url = `${YAHOO_FINANCE_BASE_URL}/${encodeURIComponent(symbol)}?interval=${params.interval}&range=${params.range}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
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

export interface IntradayBars {
  closes: PricePoint[];
  // Previous close from the chart meta, in the SAME raw native units as the bar
  // closes (NOT normalized) — so the 1D ratio model's day-open baseline stays
  // unitless even for GBp-listed instruments.
  prevClose: number | null;
}

const intradayCache = new Map<string, { data: IntradayBars; ts: number }>();

// 5m intraday bars for the 1D liquid chart plus the raw previous close. Mirrors
// fetchHistory's fetch/cache but keeps meta.chartPreviousClose so the day-open
// (yesterday's close) is available for instruments that have no overnight bars.
export async function fetchIntradayBars(symbol: string): Promise<IntradayBars> {
  const key = `${symbol}_1D_intraday`;
  const cached = intradayCache.get(key);
  if (cached && Date.now() - cached.ts < PRICE_CACHE_TTL_MS) return cached.data;

  const params = RANGE_PARAMS["1D"];
  const url = `${YAHOO_FINANCE_BASE_URL}/${encodeURIComponent(symbol)}?interval=${params.interval}&range=${params.range}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return { closes: [], prevClose: null };

    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
    const data: PricePoint[] = timestamps
      .map((ts, i) => ({ timestamp: ts, close: closes[i] as number }))
      .filter((p) => p.close != null && !isNaN(p.close));

    const rawPrev = result.meta?.chartPreviousClose ?? result.meta?.previousClose ?? null;
    const out: IntradayBars = { closes: data, prevClose: typeof rawPrev === "number" ? rawPrev : null };
    intradayCache.set(key, { data: out, ts: Date.now() });
    return out;
  } catch (err) {
    console.error("fetchIntradayBars failed for", symbol, ":", err);
    return { closes: [], prevClose: null };
  }
}

interface YahooResult {
  price: number;
  previousClose: number;
  nativeCurrency: string;
}

export interface PriceResult {
  symbol: string;
  price: number;          // native currency (Yahoo's original, after GBp normalisation)
  previousClose: number;  // native currency — same base, so % change is always correct
  nativePrice: number;    // alias for price; kept for backwards compatibility
  nativeCurrency: string;
  error?: string;
  // Set by fetchPriceWithFallback when the resolver rewrote the symbol (e.g. ZPRR → ZPRR.DE).
  // Callers can compare requested_symbol !== symbol to detect the rewrite and self-heal stored values.
  requested_symbol?: string;
}

export interface YahooQuote {
  symbol: string;
  longName: string | null;
  shortName: string | null;
}

const priceCache = new Map<string, { data: Omit<PriceResult, "symbol">; ts: number }>();

export async function fetchYahooPrice(symbol: string): Promise<PriceResult> {
  const cached = priceCache.get(symbol);
  if (cached && Date.now() - cached.ts < PRICE_CACHE_TTL_MS) {
    return { symbol, ...cached.data };
  }

  try {
    const url = `${YAHOO_FINANCE_BASE_URL}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
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

    const result: Omit<PriceResult, "symbol"> = {
      price: yahoo.price,
      previousClose: yahoo.previousClose,
      nativePrice: yahoo.price,
      nativeCurrency: yahoo.nativeCurrency,
    };
    priceCache.set(symbol, { data: result, ts: Date.now() });
    return { symbol, ...result };
  } catch {
    return { symbol, price: 0, previousClose: 0, nativePrice: 0, nativeCurrency: "", error: "fetch failed" };
  }
}

export async function fetchPriceWithFallback(symbol: string, country?: string): Promise<PriceResult> {
  const primary = await fetchYahooPrice(symbol);
  if (!primary.error) return { ...primary, requested_symbol: symbol };

  if (symbol.includes(".")) return { ...primary, requested_symbol: symbol };

  const suffixes = venuePriorityFor(country ?? "");
  const candidates = suffixes.map((s) => `${symbol}.${s}`);

  const settled = await Promise.allSettled(candidates.map(fetchYahooPrice));

  for (const outcome of settled) {
    if (outcome.status === "fulfilled" && !outcome.value.error) {
      return { ...outcome.value, requested_symbol: symbol };
    }
  }

  return { ...primary, requested_symbol: symbol };
}

// Live-price a set of holdings the SAME way the dashboard does: fetch every
// symbol via fetchPriceWithFallback (the /api/prices path) and re-value each
// tradeable to round(livePrice × units) in the price's native currency, using the
// shared applyLivePrice formula. Holdings without a symbol+units pass through.
// This is the canonical "now" portfolio so the scenario baseline matches the
// dashboard for the same moment.
export async function priceHoldingsLive<
  T extends { symbol?: string | null; units?: number | null; value: number; currency: string; country?: string | null },
>(assets: T[]): Promise<T[]> {
  const entries = assets
    .filter((a) => a.symbol && a.units)
    .map((a) => ({ symbol: a.symbol as string, country: a.country ?? undefined }));
  if (entries.length === 0) return assets;

  const settled = await Promise.allSettled(entries.map((e) => fetchPriceWithFallback(e.symbol, e.country)));
  const priceMap: Record<string, PriceResult> = {};
  for (const r of settled) {
    if (r.status === "fulfilled" && !r.value.error) {
      priceMap[r.value.requested_symbol ?? r.value.symbol] = r.value;
    }
  }
  return assets.map((a) => (a.symbol ? applyLivePrice(a, priceMap[a.symbol]) : a));
}

// ── Quote (name) ──────────────────────────────────────────────────────────────

const NAME_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const nameCache = new Map<string, { data: Pick<YahooQuote, "longName" | "shortName">; ts: number }>();

export async function fetchYahooQuote(symbol: string): Promise<YahooQuote> {
  const cached = nameCache.get(symbol);
  if (cached && Date.now() - cached.ts < NAME_CACHE_TTL_MS) {
    return { symbol, ...cached.data };
  }
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return { symbol, longName: null, shortName: null };
    const data = await res.json();
    const q = data?.quoteResponse?.result?.[0];
    const longName = typeof q?.longName === "string" ? q.longName : null;
    const shortName = typeof q?.shortName === "string" ? q.shortName : null;
    if (longName !== null || shortName !== null) {
      nameCache.set(symbol, { data: { longName, shortName }, ts: Date.now() });
    }
    return { symbol, longName, shortName };
  } catch {
    return { symbol, longName: null, shortName: null };
  }
}

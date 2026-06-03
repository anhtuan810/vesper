// Resolve a free-text asset hint (name or ticker, held or not) to a
// Yahoo-resolvable symbol for the hypothetical-acquisition flow. Order:
//   1. ambiguous-alias map (share classes etc.) → ambiguous,
//   2. alias map (common crypto + mega-caps) → resolved,
//   3. the hint as a direct ticker (uppercase, ticker-shaped) → resolved,
//   4. a Yahoo symbol search → resolved (best match) or none.
// Steps 1–3 are pure and deterministic (no network); step 4 is the async fallback.

import { FETCH_TIMEOUT_MS } from "@/lib/constants";

export interface SymbolCandidate {
  symbol: string;
  label: string;
}
export type MarketSymbolResolution =
  | { kind: "resolved"; symbol: string; label: string }
  | { kind: "ambiguous"; candidates: SymbolCandidate[] }
  | { kind: "none" };

// Common cases that wouldn't resolve from a bare ticker (names, crypto pairs).
const ALIASES: Record<string, SymbolCandidate> = {
  bitcoin: { symbol: "BTC-USD", label: "Bitcoin" },
  btc: { symbol: "BTC-USD", label: "Bitcoin" },
  ethereum: { symbol: "ETH-USD", label: "Ethereum" },
  eth: { symbol: "ETH-USD", label: "Ethereum" },
  solana: { symbol: "SOL-USD", label: "Solana" },
  sol: { symbol: "SOL-USD", label: "Solana" },
  cardano: { symbol: "ADA-USD", label: "Cardano" },
  ada: { symbol: "ADA-USD", label: "Cardano" },
  dogecoin: { symbol: "DOGE-USD", label: "Dogecoin" },
  doge: { symbol: "DOGE-USD", label: "Dogecoin" },
  ripple: { symbol: "XRP-USD", label: "XRP" },
  xrp: { symbol: "XRP-USD", label: "XRP" },
  apple: { symbol: "AAPL", label: "Apple" },
  nvidia: { symbol: "NVDA", label: "NVIDIA" },
  tesla: { symbol: "TSLA", label: "Tesla" },
  microsoft: { symbol: "MSFT", label: "Microsoft" },
  amazon: { symbol: "AMZN", label: "Amazon" },
  netflix: { symbol: "NFLX", label: "Netflix" },
  meta: { symbol: "META", label: "Meta" },
  facebook: { symbol: "META", label: "Meta" },
  "s&p 500": { symbol: "^GSPC", label: "S&P 500" },
  "sp500": { symbol: "^GSPC", label: "S&P 500" },
  "s&p500": { symbol: "^GSPC", label: "S&P 500" },
  nasdaq: { symbol: "^IXIC", label: "Nasdaq" },
};

// Hints that genuinely map to more than one obvious symbol.
const AMBIGUOUS_ALIASES: Record<string, SymbolCandidate[]> = {
  google: [
    { symbol: "GOOGL", label: "Alphabet (Class A)" },
    { symbol: "GOOG", label: "Alphabet (Class C)" },
  ],
  alphabet: [
    { symbol: "GOOGL", label: "Alphabet (Class A)" },
    { symbol: "GOOG", label: "Alphabet (Class C)" },
  ],
};

// Uppercase, ticker-shaped: 1–6 letters with an optional one-segment suffix
// (e.g. NVDA, BTC-USD, BRK.B, ^GSPC). Requires uppercase so lowercase words fall
// through to the search rather than being treated as tickers.
const TICKER_RE = /^\^?[A-Z]{1,6}([.\-=][A-Z0-9]{1,6})?$/;

/** Pure, network-free resolution. Returns `none` when only a Yahoo search could help. */
export function resolveMarketSymbolLocal(hint: string): MarketSymbolResolution {
  const trimmed = (hint ?? "").trim();
  if (!trimmed) return { kind: "none" };
  const lower = trimmed.toLowerCase();

  if (AMBIGUOUS_ALIASES[lower]) return { kind: "ambiguous", candidates: AMBIGUOUS_ALIASES[lower] };
  if (ALIASES[lower]) return { kind: "resolved", ...ALIASES[lower] };
  if (TICKER_RE.test(trimmed)) return { kind: "resolved", symbol: trimmed, label: trimmed };

  return { kind: "none" };
}

interface YahooSearchQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
}

// Yahoo symbol search — best-effort, returns [] on any failure.
async function yahooSymbolSearch(query: string): Promise<YahooSearchQuote[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=6&newsCount=0`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return [];
    const data = await res.json();
    const quotes = data?.quotes;
    return Array.isArray(quotes) ? (quotes as YahooSearchQuote[]) : [];
  } catch {
    return [];
  }
}

const SEARCHABLE_TYPES = new Set(["EQUITY", "ETF", "CRYPTOCURRENCY", "INDEX", "MUTUALFUND", "CURRENCY"]);

/** Full resolution: local rules first, then a Yahoo symbol search for names. */
export async function resolveMarketSymbol(hint: string): Promise<MarketSymbolResolution> {
  const local = resolveMarketSymbolLocal(hint);
  if (local.kind !== "none") return local;

  const quotes = (await yahooSymbolSearch(hint)).filter(
    (q) => q.symbol && (!q.quoteType || SEARCHABLE_TYPES.has(q.quoteType)),
  );
  if (quotes.length === 0) return { kind: "none" };

  const top = quotes[0];
  return { kind: "resolved", symbol: top.symbol!, label: top.shortname || top.longname || top.symbol! };
}

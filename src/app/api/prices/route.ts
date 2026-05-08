import { NextRequest, NextResponse } from "next/server";
import { validateEnv } from "@/lib/env";
import { normalizePrice } from "@/lib/prices";
import { toEur } from "@/app/api/fx/route";

validateEnv();

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

async function fetchYahooPrice(symbol: string): Promise<PriceResult> {
  const cached = priceCache.get(symbol);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { symbol, ...cached.data };
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;

    if (!meta) return { symbol, price: 0, previousClose: 0, nativePrice: 0, nativeCurrency: "", error: "not found" };

    const rawPrice: number = meta.regularMarketPrice;
    const prevClose: number = meta.chartPreviousClose || meta.previousClose;
    const yahooCurrency: string = meta.currency || "USD";

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

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "Symbol required" }, { status: 400 });

  const result = await fetchYahooPrice(symbol);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.error === "not found" ? 404 : 500 });
  }
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const { symbols } = await req.json();
  if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
    return NextResponse.json({ error: "Symbols array required" }, { status: 400 });
  }

  const results = await Promise.all(symbols.map((s: string) => fetchYahooPrice(s)));
  return NextResponse.json({ prices: results });
}

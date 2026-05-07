import { NextRequest, NextResponse } from "next/server";
import { validateEnv } from "@/lib/env";

validateEnv();

interface PriceResult {
  symbol: string;
  price: number;
  previousClose: number;
  currency: string;
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

    if (!meta) return { symbol, price: 0, previousClose: 0, currency: "", error: "not found" };

    const result = {
      price: meta.regularMarketPrice,
      previousClose: meta.chartPreviousClose || meta.previousClose,
      currency: meta.currency,
    };
    priceCache.set(symbol, { data: result, ts: Date.now() });
    return { symbol, ...result };
  } catch {
    return { symbol, price: 0, previousClose: 0, currency: "", error: "fetch failed" };
  }
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");

  if (!symbol) {
    return NextResponse.json({ error: "Symbol required" }, { status: 400 });
  }

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

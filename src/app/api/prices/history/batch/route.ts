import { NextRequest, NextResponse } from "next/server";

interface PricePoint {
  timestamp: number;
  close: number;
}

const cache = new Map<string, { data: PricePoint[]; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

const RANGE_PARAMS: Record<string, { interval: string; range: string }> = {
  "1D": { interval: "5m",  range: "1d"  },
  "1W": { interval: "1d",  range: "5d"  },
  "1M": { interval: "1d",  range: "1mo" },
  "3M": { interval: "1d",  range: "3mo" },
  "1Y": { interval: "1d",  range: "1y"  },
  "ALL": { interval: "1wk", range: "10y" },
};

async function fetchHistory(symbol: string, range: string): Promise<PricePoint[]> {
  const key = `${symbol}_${range}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

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

    cache.set(key, { data, ts: Date.now() });
    return data;
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const { symbols, range = "1W" } = await req.json();

  if (!Array.isArray(symbols) || symbols.length === 0) {
    return NextResponse.json({ error: "symbols array required" }, { status: 400 });
  }

  const unique = [...new Set(symbols as string[])];
  const results = await Promise.all(unique.map((s) => fetchHistory(s, range)));

  const data: Record<string, PricePoint[]> = {};
  unique.forEach((s, i) => { data[s] = results[i]; });

  return NextResponse.json({ data });
}

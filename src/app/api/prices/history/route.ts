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

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  const range = req.nextUrl.searchParams.get("range") ?? "1W";

  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const key = `${symbol}_${range}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ data: cached.data });
  }

  const params = RANGE_PARAMS[range] ?? RANGE_PARAMS["1W"];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${params.interval}&range=${params.range}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const json = await res.json();
    const result = json?.chart?.result?.[0];

    if (!result) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

    const data: PricePoint[] = timestamps
      .map((ts, i) => ({ timestamp: ts, close: closes[i] as number }))
      .filter((p) => p.close != null && !isNaN(p.close));

    cache.set(key, { data, ts: Date.now() });
    return NextResponse.json({ data });
  } catch (err) {
    console.error("prices/history fetch failed:", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

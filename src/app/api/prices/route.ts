import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");

  if (!symbol) {
    return NextResponse.json({ error: "Symbol required" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;

    if (!meta) {
      return NextResponse.json({ error: "Symbol not found" }, { status: 404 });
    }

    return NextResponse.json({
      symbol,
      price: meta.regularMarketPrice,
      previousClose: meta.chartPreviousClose || meta.previousClose,
      currency: meta.currency,
      exchangeName: meta.exchangeName,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch price" },
      { status: 500 }
    );
  }
}

// Batch price fetch — multiple symbols at once
export async function POST(req: NextRequest) {
  const { symbols } = await req.json();

  if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
    return NextResponse.json({ error: "Symbols array required" }, { status: 400 });
  }

  const results = await Promise.all(
    symbols.map(async (symbol: string) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        const data = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;

        if (!meta) return { symbol, error: "not found" };

        return {
          symbol,
          price: meta.regularMarketPrice,
          previousClose: meta.chartPreviousClose || meta.previousClose,
          currency: meta.currency,
        };
      } catch {
        return { symbol, error: "fetch failed" };
      }
    })
  );

  return NextResponse.json({ prices: results });
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase";
import { fetchIntradayBars } from "@/lib/prices-server";
import { easternMidnightUnix } from "@/lib/market-day";

// 1D intraday series for a single symbol, clipped to today's US-Eastern trading
// day — the SAME window the portfolio liquid 1D uses, so the two charts cover
// the same span and both read "today". The previous close is the day-open
// baseline (the line starts at yesterday's close, the daily % is measured from
// there, and a session instrument's overnight gap renders as a step). When
// nothing has traded today yet (pre-market / weekend) the line is flat at the
// previous close.
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const { closes, prevClose } = await fetchIntradayBars(symbol);
  const windowStart = easternMidnightUnix();
  const within = closes.filter((b) => b.timestamp >= windowStart);
  const before = closes.filter((b) => b.timestamp < windowStart);
  const dayOpen = before.length > 0
    ? before[before.length - 1].close
    : prevClose ?? (within.length > 0 ? within[0].close : null);

  let points: Array<{ timestamp: number; close: number }> = [];
  if (dayOpen != null && within.length > 0) {
    const first = within[0];
    // A session instrument (no overnight trading) holds the day-open flat until
    // just before its open, so the gap renders as a step — matching the
    // portfolio's overnight-then-open shape. Continuous (crypto) starts straight
    // from the day open.
    const hasOvernightGap = first.timestamp - windowStart > 1800;
    points = hasOvernightGap
      ? [{ timestamp: windowStart, close: dayOpen }, { timestamp: first.timestamp - 300, close: dayOpen }]
      : [{ timestamp: windowStart, close: dayOpen }];
    for (const b of within) points.push({ timestamp: b.timestamp, close: b.close });
  } else if (dayOpen != null) {
    // Nothing traded today yet → a flat line at the previous close.
    points = [
      { timestamp: windowStart, close: dayOpen },
      { timestamp: Math.floor(Date.now() / 1000), close: dayOpen },
    ];
  }

  return NextResponse.json({ data: points }, {
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
  });
}

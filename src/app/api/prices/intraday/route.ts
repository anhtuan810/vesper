import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase";
import { fetchIntradayBars } from "@/lib/prices-server";

// 1D intraday series for a single symbol — the most recent session's 5m bars
// with the previous close prepended as the day-open baseline. So the line
// starts at yesterday's close (the overnight gap reads as the first step) and
// the daily % is measured from there, matching the portfolio liquid 1D. Keeps
// the "most recent session" window (so pre-market / weekends still show the last
// session) rather than a strict calendar-day clip.
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const { closes, prevClose } = await fetchIntradayBars(symbol);
  const points = closes.map((b) => ({ timestamp: b.timestamp, close: b.close }));
  if (prevClose != null && points.length > 0) {
    // One interval (5m) before the first bar, so the baseline sits just left of
    // the open and the gap renders as the first short step.
    points.unshift({ timestamp: points[0].timestamp - 300, close: prevClose });
  }

  return NextResponse.json({ data: points }, {
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
  });
}

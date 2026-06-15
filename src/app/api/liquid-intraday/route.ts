import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { fetchIntradayBars } from "@/lib/prices-server";

// Public markets + crypto — the liquid set (same as PortfolioTab Phase B).
const LIQUID_TYPES = new Set(["stocks", "etf", "crypto"]);

// Epoch (seconds) of the start of today's US-Eastern trading day. "1D" is
// anchored to the market day for everyone (US or EU): session-bound stocks
// define their day/previous-close in ET, and crypto (24/7) follows that day so
// the combined line shares one clock instead of spanning a rolling 24h.
function easternMidnightUnix(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const secsSinceMidnight = (get("hour") % 24) * 3600 + get("minute") * 60 + get("second");
  return Math.floor(now.getTime() / 1000) - secsSinceMidnight;
}

// Per-asset 5m intraday close series for the liquid holdings, clipped to today's
// ET trading day, used to draw the combined 1D line in the Liquid-only view.
// Each asset also carries its day-open close (the last bar before ET midnight,
// or the previous close for instruments with no overnight bars) so the line —
// and the daily % — start from yesterday's close, capturing the stock open gap
// without needing overnight (8pm-4am) trade data. No schema, no mutations.
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("assets")
    .select("id, type, symbol")
    .eq("user_id", user.id)
    .is("removed_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const liquid = (data ?? []).filter(
    (a): a is { id: string; type: string; symbol: string } =>
      LIQUID_TYPES.has(a.type) && typeof a.symbol === "string" && a.symbol.length > 0,
  );

  const windowStart = easternMidnightUnix();

  // Fetch every symbol's bars in parallel, then split at the ET-day boundary:
  // bars within the day feed the line; the most recent bar before it (or the
  // previous close) is the day-open baseline.
  const settled = await Promise.all(
    liquid.map(async (a) => {
      const { closes, prevClose } = await fetchIntradayBars(a.symbol);
      const within = closes.filter((b) => b.timestamp >= windowStart);
      const before = closes.filter((b) => b.timestamp < windowStart);
      const dayOpen = before.length > 0
        ? before[before.length - 1].close
        : prevClose ?? (within.length > 0 ? within[0].close : null);
      return { id: a.id, dayOpen, closes: within.map((b) => ({ t: b.timestamp, close: b.close })) };
    }),
  );
  // Keep assets that actually traded today; the client treats anything missing
  // (e.g. a stock on a weekend) as a flat current-value contribution.
  const assets = settled.filter((a) => a.closes.length > 0 && a.dayOpen != null);

  return NextResponse.json({ windowStart, assets }, {
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
  });
}

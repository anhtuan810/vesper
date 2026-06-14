import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { fetchHistory } from "@/lib/prices-server";

// Public markets + crypto — the liquid set (same as PortfolioTab Phase B).
const LIQUID_TYPES = new Set(["stocks", "etf", "crypto"]);

// Per-asset 5m intraday close series for the liquid holdings, used to draw the
// combined 1D line in the Liquid-only view. No schema, no mutations — Yahoo 5m
// bars only, via the shared fetchHistory (RANGE_PARAMS["1D"] = 5m/1d).
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

  // Fetch every symbol's 5m bars in parallel. Assets whose fetch came back empty
  // (no symbol coverage, or a session that hasn't opened yet) are omitted — the
  // client treats a missing asset as a flat current-value contribution.
  const settled = await Promise.all(
    liquid.map(async (a) => {
      const bars = await fetchHistory(a.symbol, "1D");
      return { id: a.id, closes: bars.map((b) => ({ t: b.timestamp, close: b.close })) };
    }),
  );
  const assets = settled.filter((a) => a.closes.length > 0);

  return NextResponse.json({ assets }, {
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
  });
}

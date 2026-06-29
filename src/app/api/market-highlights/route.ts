import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { parseMarketDetail } from "@/lib/market-highlights";

// Standalone read of the user's current daily market-news highlights
// (cron-generated `type='market'`), the same set dashboard-init carries for the
// Portfolio page. Split out so the Vitals page can surface the Markets block at
// its top without paying for dashboard-init's snapshot backfill + mutations read.
// Read-only; returns [] when there are none.
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const now = new Date().toISOString();

  const { data } = await supabase
    .from("highlights")
    .select("id, title, detail")
    .eq("user_id", user.id)
    .eq("type", "market")
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(3);

  const marketHighlights = (data ?? []).map((row) => {
    const { text, impact_eur, symbol } = parseMarketDetail(row.detail ?? "");
    return { id: row.id, title: row.title ?? "", detail: text, impact_eur, symbol };
  });

  return NextResponse.json(
    { marketHighlights },
    { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=300" } },
  );
}

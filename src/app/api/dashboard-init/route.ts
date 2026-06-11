import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { backfillSnapshots } from "@/lib/snapshot";
import { parseMarketDetail } from "@/lib/market-highlights";

const RANGE_DAYS = 30; // default 1M

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RANGE_DAYS);

  const now = new Date().toISOString();

  const [portfolioRes, insightRes, marketRes, snapshotsRes, mutationsRes] = await Promise.all([
    supabase
      .from("highlights")
      .select("title, detail")
      .eq("user_id", user.id)
      .eq("type", "portfolio")
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(3),
    // Insight is READ-ONLY here: return the fresh cached insight if present, else
    // null. Generation (Haiku) is never invoked on this critical path — the chart
    // and mutations must never wait behind it. On a miss the client fills the band
    // from /api/insight separately. See src/app/(main)/page.tsx fetchDashboardInit.
    supabase
      .from("highlights")
      .select("title, detail")
      .eq("user_id", user.id)
      .eq("type", "insight")
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("highlights")
      .select("id, title, detail")
      .eq("user_id", user.id)
      .eq("type", "market")
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(3),

    supabase
      .from("snapshots")
      .select("date, total_value")
      .eq("user_id", user.id)
      .gte("date", cutoff.toISOString().slice(0, 10))
      .gt("total_value", 0)
      .order("date", { ascending: true }),

    supabase
      .from("mutations")
      .select("*")
      .eq("user_id", user.id)
      .order("occurred_at", { ascending: false, nullsFirst: false }),
  ]);

  let snapshots = snapshotsRes.data ?? [];

  const today = new Date().toISOString().slice(0, 10);
  const hasHistory = snapshots.some((s) => s.date < today);

  if (!hasHistory) {
    await backfillSnapshots(user.id);
    const refetch = await supabase
      .from("snapshots")
      .select("date, total_value")
      .eq("user_id", user.id)
      .gte("date", cutoff.toISOString().slice(0, 10))
      .gt("total_value", 0)
      .order("date", { ascending: true });
    snapshots = refetch.data ?? [];
  }

  const portfolioCards = (portfolioRes.data ?? [])
    .map((r) => ({ title: r.title ?? "", detail: r.detail ?? "" }))
    .filter((c) => c.detail);

  // Same "portfolio cards, else single cached insight" precedence as
  // /api/insight, so the band can be primed from this one round-trip.
  const insights = portfolioCards.length > 0
    ? portfolioCards
    : insightRes.data?.detail
      ? [{ title: insightRes.data.title ?? "", detail: insightRes.data.detail }]
      : [];

  const market = (marketRes.data ?? []).map((row) => {
    const { text, impact_eur, symbol } = parseMarketDetail(row.detail ?? "");
    return { id: row.id, title: row.title ?? "", detail: text, impact_eur, symbol };
  });

  return NextResponse.json({
    insights,
    insight: insightRes.data?.detail ?? null,
    market,
    marketHighlights: market,
    snapshots,
    mutations: mutationsRes.data ?? [],
  }, {
    headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=300" },
  });
}

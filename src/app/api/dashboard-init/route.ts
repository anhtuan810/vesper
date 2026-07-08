import { NextRequest, NextResponse, after } from "next/server";
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

  const snapshots = snapshotsRes.data ?? [];

  const today = new Date().toISOString().slice(0, 10);
  const hasHistory = snapshots.some((s) => s.date < today);

  // A past-dated holding is what makes a rebuild produce pre-today rows: an add
  // mutation's occurred_at is the acquisition date (= buy_date), so any mutation
  // dated before today means real history is coming. A portfolio added entirely
  // "today" has none to build.
  const hasPastBasis = (mutationsRes.data ?? []).some(
    (m) => typeof m.occurred_at === "string" && (m.occurred_at as string).slice(0, 10) < today,
  );

  // No reconstructed history yet (a first-ever load, or the background rebuild
  // from a recent add hasn't landed). Previously we AWAITED the full backfill
  // here — Yahoo price history per symbol + a multi-year FX series + the whole
  // date lattice — so the dashboard hung on it before it could paint. Kick it in
  // the background instead (cheap + self-healing; a no-op when there's nothing to
  // build). Only flag `building` when a past-dated holding means rows are actually
  // coming: the client then shows the same quiet "building" indicator it uses after
  // a chat add and polls /api/snapshots until they land (watchPortfolioBuild). This
  // gate keeps a today-only new user from seeing the spinner churn the whole watch
  // window with nothing to fill in. The chart paints immediately either way.
  if (!hasHistory) after(() => backfillSnapshots(user.id));
  const building = !hasHistory && hasPastBasis;

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
    building,
  }, {
    headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=300" },
  });
}

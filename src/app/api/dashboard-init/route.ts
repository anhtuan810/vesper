import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { backfillSnapshots } from "@/lib/snapshot";

const RANGE_DAYS = 30; // default 1M

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RANGE_DAYS);

  const [insightRes, snapshotsRes, mutationsRes] = await Promise.all([
    supabase
      .from("highlights")
      .select("detail")
      .eq("user_id", user.id)
      .eq("type", "insight")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("snapshots")
      .select("date, total_value")
      .eq("user_id", user.id)
      .gte("date", cutoff.toISOString().slice(0, 10))
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
      .order("date", { ascending: true });
    snapshots = refetch.data ?? [];
  }

  return NextResponse.json({
    insight: insightRes.data?.detail ?? null,
    snapshots,
    mutations: mutationsRes.data ?? [],
  }, {
    headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=300" },
  });
}

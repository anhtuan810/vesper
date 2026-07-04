import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";

const RANGE_DAYS: Record<string, number | null> = {
  "1D": 1,
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "1Y": 365,
  "3Y": 1095,
  "All": null,
};

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;

  // Optional explicit date window (YYYY-MM-DD), additive: when either bound is
  // present it OVERRIDES the preset range. Lets callers fetch a narrow slice (e.g.
  // the trajectory baseline ~365d ago) instead of pulling range=All. Existing
  // callers that pass only `range` are unaffected.
  const after = params.get("after");
  const before = params.get("before");

  const supabase = createServerSupabase();
  let query = supabase
    .from("snapshots")
    // `snapshots` is keyed on (user_id, date) — there is no `id` column (every
    // other read selects without it; writeSnapshot upserts onConflict
    // "user_id,date"). Selecting a non-existent `id` here made this route 500
    // (the same class of bug as entitlements.select("id")), which would leave
    // the chart's range/All fetch empty — a single dot even when rows exist. The
    // response mapping never used `id` anyway.
    .select("date, total_value, breakdown, native_breakdown")
    .eq("user_id", user.id)
    .gt("total_value", 0)
    .order("date", { ascending: true });

  if (after || before) {
    if (after) query = query.gte("date", after);
    if (before) query = query.lte("date", before);
  } else {
    const range = params.get("range") ?? "1M";
    const days = Object.prototype.hasOwnProperty.call(RANGE_DAYS, range)
      ? RANGE_DAYS[range]
      : 30;
    if (days !== null) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      query = query.gte("date", cutoff.toISOString().slice(0, 10));
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((r) => ({
    date: r.date,
    total_value: r.total_value,
    breakdown: r.breakdown,
    native_breakdown: r.native_breakdown,
  }));

  return NextResponse.json({ data: rows }, {
    headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=1800" },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";

const RANGE_DAYS: Record<string, number | null> = {
  "1D": 1,
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "1Y": 365,
  "All": null,
};

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const range = request.nextUrl.searchParams.get("range") ?? "1M";
  const days = Object.prototype.hasOwnProperty.call(RANGE_DAYS, range)
    ? RANGE_DAYS[range]
    : 30;

  const supabase = createServerSupabase();
  let query = supabase
    .from("snapshots")
    .select("date, total_value")
    .eq("user_id", user.id)
    .order("date", { ascending: true });

  if (days !== null) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    query = query.gte("date", cutoff.toISOString().slice(0, 10));
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] }, {
    headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=1800" },
  });
}

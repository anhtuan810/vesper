import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { buildModeledHistory, type ModeledAssetInput } from "@/lib/modeled-history";

// Stitched net-worth trajectory: a deterministically RECONSTRUCTED `modeled`
// segment (computed on the fly — never persisted) covering the gap between a
// position's stated acquisition date and the first live snapshot, plus the
// real `live` segment from the snapshots table. `trackingStart` is the first
// live-snapshot date — the boundary the chart draws the modeled/live seam at.
//
// Returns an empty `modeled` array (and null `trackingStart` only when there
// is no live history at all yet) whenever no asset carries an acquisition
// date — the chart then falls back to the existing "track from today" marker.
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();

  const [{ data: snapshots, error: sErr }, { data: assets, error: aErr }] = await Promise.all([
    supabase
      .from("snapshots")
      .select("date, total_value")
      .eq("user_id", user.id)
      .gt("total_value", 0)
      .order("date", { ascending: true }),
    supabase
      .from("assets")
      .select("id, type, value, currency, symbol, units, buy_price, buy_date, country, address, mortgage_balance, mortgage_balance_recorded_at, mortgage_rate, monthly_payment, mortgage_type")
      .eq("user_id", user.id),
  ]);
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

  const live = snapshots ?? [];
  const trackingStart = live.length > 0 ? live[0].date : null;

  let modeled: Array<{ date: string; total_value: number }> = [];
  if (trackingStart && assets && assets.length > 0) {
    const inputs: ModeledAssetInput[] = assets.map((a) => ({
      id: a.id as string,
      type: a.type as string,
      value: (a.value as number) ?? 0,
      currency: a.currency as string | null,
      symbol: a.symbol as string | null,
      units: a.units as number | null,
      buy_price: a.buy_price as number | null,
      buy_date: a.buy_date as string | null,
      country: a.country as string | null,
      address: a.address as string | null,
      mortgage_balance: a.mortgage_balance as number | null,
      mortgage_balance_recorded_at: a.mortgage_balance_recorded_at as string | null,
      mortgage_rate: a.mortgage_rate as number | null,
      monthly_payment: a.monthly_payment as number | null,
      mortgage_type: a.mortgage_type as string | null,
    }));
    const result = await buildModeledHistory(inputs, trackingStart);
    modeled = result.points;
  }

  return NextResponse.json(
    { modeled, live, trackingStart },
    { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=1800" } }
  );
}

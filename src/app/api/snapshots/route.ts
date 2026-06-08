import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { getUsdRates, getHistoricalUsdRates, historicalFxRate } from "@/lib/fx";
import { SUPPORTED_CURRENCIES, type DisplayCurrency } from "@/lib/money";

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
    .select("date, total_value")
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

  const rows = data ?? [];

  // Each row's `total_value` was stored in USD at ITS OWN date's historical FX
  // rate (see backfillSnapshots' `rateAt`). Converting it to the display
  // currency must use that SAME per-date rate — multiplying by today's rate
  // would inject FX drift into every historical point (the basis it was stored
  // with no longer cancels). Resolve and attach each row's historical
  // USD→{display currency} rates so the client can convert on the same basis
  // it was stored with, not today's.
  let withFx: Array<{ date: string; total_value: number; fx?: Partial<Record<DisplayCurrency, number>> }> = rows;
  if (rows.length > 0) {
    const earliest = rows[0].date as string;
    const latest = rows[rows.length - 1].date as string;
    const [fxSeries, currentFx] = await Promise.all([
      getHistoricalUsdRates(earliest, latest),
      getUsdRates(),
    ]);
    const sortedDates = Object.keys(fxSeries).sort();
    const quoteCurrencies = SUPPORTED_CURRENCIES.filter((c) => c !== "USD");
    withFx = rows.map((r) => {
      const fx: Partial<Record<DisplayCurrency, number>> = {};
      for (const c of quoteCurrencies) {
        const rate = historicalFxRate(fxSeries, sortedDates, r.date as string, c, currentFx);
        if (rate != null) fx[c] = rate;
      }
      return { ...r, fx };
    });
  }

  return NextResponse.json({ data: withFx }, {
    headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=1800" },
  });
}

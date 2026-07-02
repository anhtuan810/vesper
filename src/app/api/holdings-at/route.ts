import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase";
import { reconstructHoldingsAt } from "@/lib/snapshot";

// GET /api/holdings-at?date=YYYY-MM-DD — the portfolio AS OF a past date,
// reconstructed from the user's own records (mutation timeline × historical
// closes; real estate on the backfill's CBS/mortgage curves; flat types at
// recorded value). Powers the named rewind: tapping a decision dot stands the
// hero AND the holdings list at that day, both summed from these same rows.
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  if (date >= todayStr) {
    return NextResponse.json({ error: "Date must be in the past" }, { status: 400 });
  }

  try {
    const holdings = await reconstructHoldingsAt(user.id, date);
    // A past date's book never changes under the user's feet (records + closes
    // are historical facts), so an hour of private caching is safe and spares
    // repeated dot-taps the full reconstruction.
    return NextResponse.json({ data: holdings }, {
      headers: { "Cache-Control": "private, max-age=3600" },
    });
  } catch (err) {
    console.error("holdings-at error:", err);
    return NextResponse.json({ error: "Reconstruction failed" }, { status: 500 });
  }
}

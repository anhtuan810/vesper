import { NextRequest, NextResponse } from "next/server";
import { getUsdRates } from "@/lib/fx";
import { getAuthUser } from "@/lib/supabase";

export type { FxRates } from "@/lib/fx";
export { getUsdRates, toUsd } from "@/lib/fx";

// GET endpoint so it can be pinged to warm the cache (used by cron later).
// ?base=USD&quote=EUR returns { base, quote, rate } for the named pair.
// Without ?quote, returns { base, rates } with all pairs.
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const CC = { headers: { "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400" } };
  try {
    const rates = await getUsdRates();
    const quote = request.nextUrl.searchParams.get("quote")?.toUpperCase();
    if (quote) {
      const rate = rates[quote];
      if (rate === undefined) {
        return NextResponse.json({ error: `Unknown quote currency: ${quote}` }, { status: 400 });
      }
      return NextResponse.json({ base: "USD", quote, rate }, CC);
    }
    return NextResponse.json({ base: "USD", rates }, CC);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 503 });
  }
}

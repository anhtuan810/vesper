import { NextRequest, NextResponse } from "next/server";
import { getEurRates } from "@/lib/fx";

export type { FxRates } from "@/lib/fx";
export { getEurRates, toEur } from "@/lib/fx";

// GET endpoint so it can be pinged to warm the cache (used by cron later).
// ?base=EUR&quote=USD returns { base, quote, rate } for the named pair.
// Without ?quote, returns { base, rates } with all pairs.
export async function GET(request: NextRequest) {
  try {
    const rates = await getEurRates();
    const quote = request.nextUrl.searchParams.get("quote")?.toUpperCase();
    if (quote) {
      const rate = rates[quote];
      if (rate === undefined) {
        return NextResponse.json({ error: `Unknown quote currency: ${quote}` }, { status: 400 });
      }
      return NextResponse.json({ base: "EUR", quote, rate });
    }
    return NextResponse.json({ base: "EUR", rates });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 503 });
  }
}

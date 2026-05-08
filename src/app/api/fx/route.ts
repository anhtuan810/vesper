import { NextResponse } from "next/server";
import { getEurRates } from "@/lib/fx";

export type { FxRates } from "@/lib/fx";
export { getEurRates, toEur } from "@/lib/fx";

// GET endpoint so it can be pinged to warm the cache (used by cron later)
export async function GET() {
  try {
    const rates = await getEurRates();
    return NextResponse.json({ base: "EUR", rates });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 503 });
  }
}

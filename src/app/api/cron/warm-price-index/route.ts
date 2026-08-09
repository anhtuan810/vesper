import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { seedNationalPriceIndex } from "@/lib/national-price-index";
import { assertCron } from "@/lib/cron-auth";

// Monthly warm-up of the global national house-price index (Eurostat prc_hpi_a).
// Runs in production, where the network is open, so the net-worth reconstruction
// never fetches it on the hot path — it reads the pre-seeded `national_price_index`
// table. Eurostat publishes at most quarterly, so monthly is generous. Best-effort:
// a failed fetch/parse leaves the last good rows in place and property history
// falls back to linear for any un-seeded country — never an error to the caller.
export async function GET(req: NextRequest) {
  const denied = assertCron(req);
  if (denied) return denied;

  const result = await seedNationalPriceIndex();
  if (!result.ok) {
    Sentry.captureMessage("cron/warm-price-index: national index seed did not complete", {
      level: "warning",
      tags: { fn: "cron/warm-price-index" },
      extra: { detail: result.detail ?? null },
    });
  }
  return NextResponse.json(result);
}

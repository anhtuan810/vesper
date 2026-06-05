import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { validateEnv } from "@/lib/env";
import { isSupportedCurrency } from "@/lib/money";
import { computeAllVitals } from "@/lib/vitals/index";
import type { VitalResult } from "@/lib/vitals/index";
import { buildVitalsInputs } from "@/lib/vitals/build-inputs";
import { computeCurrentBalance } from "@/lib/mortgage";

validateEnv();

// Deterministic Vitals body — fast, single round-trip, no Haiku. The Pulse
// sentences (all-asset + liquid-lens) load separately from /api/vitals/pulse so
// they fill in after this body has already painted the cards and numbers.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServerSupabase();

    const { user: userRow, assets, snapshots, netWorthEur } =
      await buildVitalsInputs(supabase, user.id);

    const displayCurrency = isSupportedCurrency(userRow.display_currency)
      ? userRow.display_currency
      : "EUR";
    const country: string | null = (userRow.country as string | null) ?? null;

    // Compute all vitals
    const vitals: VitalResult[] = computeAllVitals({ country }, assets, snapshots);

    // Build minimal asset list for ConcentrationBars. value/mortgage are already
    // EUR-normalized by buildVitalsInputs. The bar feed is EQUITY (real estate at
    // value − current mortgage balance), so the per-position bars divide by equity
    // net worth — matching the concentration headline/top-3 and the allocation
    // donut, instead of the old gross/gross basis.
    const minimalAssets = assets.map((a) => ({
      name: a.name,
      type: a.type,
      eurValue: a.type === "real_estate" ? Math.max(0, a.value - computeCurrentBalance(a)) : a.value,
      symbol: a.symbol,
    }));

    const res = NextResponse.json({
      vitals,
      netWorthEur,
      displayCurrency,
      assets: minimalAssets,
    });

    res.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=300");

    return res;
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "GET /api/vitals" } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

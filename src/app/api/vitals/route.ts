import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { validateEnv } from "@/lib/env";
import { isSupportedCurrency } from "@/lib/money";
import { computeAllVitals } from "@/lib/vitals/index";
import type { VitalResult } from "@/lib/vitals/index";
import { computePerspective } from "@/lib/vitals/perspective";
import type { ConcentrationValue } from "@/lib/vitals/concentration";
import type { LeverageValue } from "@/lib/vitals/leverage";
import type { LiquidityPostureValue } from "@/lib/vitals/liquidityPosture";
import type { CashRealYieldValue } from "@/lib/vitals/cashRealYield";
import { generatePulse } from "@/lib/pulse-generator";
import { buildVitalsInputs } from "@/lib/vitals/build-inputs";
import { findBaselineSnapshot, MIN_BASELINE_AGE_DAYS } from "@/lib/vitals/realGrowth";

validateEnv();

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServerSupabase();
    const nowIso = new Date().toISOString();

    const { user: userRow, assets, snapshots, netWorthEur, fxRates } =
      await buildVitalsInputs(supabase, user.id);

    const displayCurrency = isSupportedCurrency(userRow.display_currency)
      ? userRow.display_currency
      : "EUR";
    const country: string | null = (userRow.country as string | null) ?? null;
    const birthYear: number | null = (userRow.birth_year as number | null) ?? null;

    // Compute all vitals
    const vitals: VitalResult[] = computeAllVitals({ country }, assets, snapshots);
    const activeVitals = vitals.filter((v) => v.applies);

    const baseline = findBaselineSnapshot(snapshots);
    const netWorth12moAgoEur =
      baseline && baseline.ageDays >= MIN_BASELINE_AGE_DAYS
        ? baseline.snapshot.total_value
        : null;
    const perspective = computePerspective(netWorthEur, country, birthYear, netWorth12moAgoEur);

    // Build statStrip from computed vitals
    const findApplied = (key: string): VitalResult | undefined =>
      vitals.find((v) => v.key === key && v.applies);

    const concentrationVital = findApplied("concentration");
    const leverageVital = findApplied("leverage");
    const liquidityVital = findApplied("liquidityPosture");
    const cashYieldVital = findApplied("cashRealYield");

    const statStrip = {
      top1Pct: concentrationVital
        ? (concentrationVital.value as ConcentrationValue).topPositionPct
        : null,
      ltvPct: leverageVital ? (leverageVital.value as LeverageValue).ltvPct : null,
      liquid1wPct: liquidityVital
        ? (liquidityVital.value as LiquidityPostureValue).deployable1wPct
        : null,
      realYieldPct: cashYieldVital
        ? (cashYieldVital.value as CashRealYieldValue).realYieldPct
        : null,
    };

    // Pulse caching via highlights table.
    // Fetch the two most-recent pulse rows in one query:
    //   row[0] — most recent overall (may be stale); used as fallback if Haiku fails
    //   row[0] with expiry guard — still-fresh cache hit
    const pulseRows = await supabase
      .from("highlights")
      .select("detail, expires_at")
      .eq("user_id", user.id)
      .eq("type", "pulse")
      .order("created_at", { ascending: false })
      .limit(2);

    const latestRow = pulseRows.data?.[0] ?? null;
    const freshRow =
      latestRow && latestRow.expires_at > nowIso ? latestRow : null;

    let pulse: string | null = null;

    if (freshRow?.detail) {
      // Cache hit — serve without calling Haiku.
      pulse = freshRow.detail as string;
    } else {
      const generated = await generatePulse(activeVitals, displayCurrency);
      if (generated) {
        // Jitter expiry by 0–6 h so a fleet of caches don't all expire at the
        // same wall-clock moment after a shared outage recovery.
        const jitterMs = Math.random() * 6 * 60 * 60 * 1000;
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000 + jitterMs).toISOString();
        await supabase.from("highlights").insert({
          user_id: user.id,
          type: "pulse",
          title: generated,   // highlights.title is NOT NULL; pulse uses same text for both
          detail: generated,
          expires_at: expiresAt,
          seen: false,
        });
        pulse = generated;
      } else {
        // Haiku failed — serve the most-recent prior sentence (stale beats blank).
        pulse = (latestRow?.detail as string | null) ?? null;
      }
    }

    // Build minimal asset list for ConcentrationTreemap
    const eurRate = fxRates["EUR"] ?? 1;
    const toUsdSync = (amount: number, currency: string): number => {
      if (currency === "USD") return amount;
      const rate = fxRates[currency];
      return rate ? amount / rate : amount;
    };
    const minimalAssets = assets.map((a) => ({
      name: a.name,
      type: a.type,
      eurValue: toUsdSync(a.value, a.currency || "USD") * eurRate,
    }));

    const res = NextResponse.json({
      vitals,
      perspective,
      pulse,
      statStrip,
      netWorthEur,
      displayCurrency,
      assets: minimalAssets,
    });

    res.headers.set("Cache-Control", "private, max-age=3600, stale-while-revalidate=7200");

    return res;
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "GET /api/vitals" } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

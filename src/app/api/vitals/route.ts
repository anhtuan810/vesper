import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { validateEnv } from "@/lib/env";
import { isSupportedCurrency } from "@/lib/money";
import { computeAllVitals } from "@/lib/vitals/index";
import type { VitalResult } from "@/lib/vitals/index";
import { generatePulse } from "@/lib/pulse-generator";
import { buildVitalsInputs } from "@/lib/vitals/build-inputs";

validateEnv();

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServerSupabase();
    const nowIso = new Date().toISOString();

    const { user: userRow, assets, snapshots, netWorthEur } =
      await buildVitalsInputs(supabase, user.id);

    const displayCurrency = isSupportedCurrency(userRow.display_currency)
      ? userRow.display_currency
      : "EUR";
    const country: string | null = (userRow.country as string | null) ?? null;

    // Compute all vitals
    const vitals: VitalResult[] = computeAllVitals({ country }, assets, snapshots);
    const activeVitals = vitals.filter((v) => v.applies);

    // Determine whether the user holds a mixed portfolio (real estate + investable).
    // Used to decide whether to generate a second liquid-lens pulse.
    const isMixed =
      assets.some((a) => a.type === "real_estate") &&
      assets.some((a) => a.type !== "real_estate");

    // Pulse caching via highlights table.
    // Version prefix PULSE_VER is embedded in the stored detail so that old
    // cache rows (written without the prefix) are treated as stale and trigger
    // a fresh generation with the improved home-anchor framing.
    //   row[0] — most recent overall; fallback when Haiku fails
    //   row[0] with expiry + version guard — live cache hit
    const PULSE_VER = "v2:";

    const pulseRows = await supabase
      .from("highlights")
      .select("detail, expires_at")
      .eq("user_id", user.id)
      .eq("type", "pulse")
      .order("created_at", { ascending: false })
      .limit(2);

    const latestRow = pulseRows.data?.[0] ?? null;
    const freshRow =
      latestRow &&
      latestRow.expires_at > nowIso &&
      typeof latestRow.detail === "string" &&
      latestRow.detail.startsWith(PULSE_VER)
        ? latestRow
        : null;

    let pulse: string | null = null;
    let pulseLiquid: string | null = null;

    if (freshRow?.detail) {
      // Cache hit — strip the version prefix before serving.
      pulse = (freshRow.detail as string).slice(PULSE_VER.length);
    } else {
      const generated = await generatePulse(activeVitals, displayCurrency, "all");
      if (generated) {
        // Jitter expiry by 0–6 h so a fleet of caches don't all expire at the
        // same wall-clock moment after a shared outage recovery.
        const jitterMs = Math.random() * 6 * 60 * 60 * 1000;
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000 + jitterMs).toISOString();
        const storedDetail = PULSE_VER + generated;
        await supabase.from("highlights").insert({
          user_id: user.id,
          type: "pulse",
          title: storedDetail,  // highlights.title is NOT NULL
          detail: storedDetail,
          expires_at: expiresAt,
          seen: false,
        });
        pulse = generated;
      } else {
        // Haiku failed — serve the most-recent prior sentence (stale beats blank).
        const rawDetail = (latestRow?.detail as string | null) ?? null;
        pulse = rawDetail
          ? rawDetail.startsWith(PULSE_VER)
            ? rawDetail.slice(PULSE_VER.length)
            : rawDetail
          : null;
      }
    }

    // Liquid-lens pulse: generated fresh per request for mixed users only.
    // Not persisted — the session cache in useVitals holds it for the tab lifetime.
    if (isMixed) {
      const liquidActiveVitals = activeVitals.filter((v) => v.scope !== "house");
      pulseLiquid = await generatePulse(liquidActiveVitals, displayCurrency, "liquid");
    }

    // Build minimal asset list for ConcentrationBars.
    // assets.value is already EUR-normalized by buildVitalsInputs.
    const minimalAssets = assets.map((a) => ({
      name: a.name,
      type: a.type,
      eurValue: a.value,
      symbol: a.symbol,
    }));

    const res = NextResponse.json({
      vitals,
      pulse,
      pulseLiquid,
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

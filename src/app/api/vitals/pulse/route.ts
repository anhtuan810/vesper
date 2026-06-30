import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { entitledGate } from "@/lib/require-entitled";
import { validateEnv } from "@/lib/env";
import { isSupportedCurrency } from "@/lib/money";
import { computeAllVitals } from "@/lib/vitals/index";
import type { VitalResult } from "@/lib/vitals/index";
import { generatePulse } from "@/lib/pulse-generator";
import { buildVitalsInputs } from "@/lib/vitals/build-inputs";

validateEnv();

// Pulse sentences (Haiku), split off the critical Vitals render path. The body
// at /api/vitals paints first; this fills in the Pulse banner afterwards. Both
// the all-asset and liquid-lens pulses are cached in `highlights` so a return
// visit within the TTL costs zero Haiku calls.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServerSupabase();

    // Paid-access gate (server-side enforcement, not just the client paywall): the
    // Pulse calls Anthropic (Haiku), so a non-subscriber reaching this endpoint
    // directly must be refused before any generation — like every other AI route.
    const gate = await entitledGate(supabase, user.id);
    if (gate) return gate;

    const nowIso = new Date().toISOString();

    const { user: userRow, assets, snapshots } =
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
    const PULSE_VER = "v4:";

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
        const ins = await supabase.from("highlights").insert({
          user_id: user.id,
          type: "pulse",
          title: storedDetail,  // highlights.title is NOT NULL
          detail: storedDetail,
          expires_at: expiresAt,
          seen: false,
        }).select("id").single();
        // Prune superseded rows now that a fresh Pulse is stored — only AFTER the
        // insert, so a fallback row always survives if a later generation fails.
        if (ins.data?.id) {
          await supabase.from("highlights").delete()
            .eq("user_id", user.id).eq("type", "pulse").neq("id", ins.data.id);
        }
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

    // Liquid-lens pulse: mixed users only. Cached in its own highlights row
    // (type="pulse_liquid", separate version prefix) exactly like the all-asset
    // pulse above, so a return visit within the TTL spends zero Haiku calls.
    const PULSE_LIQUID_VER = "v2:";

    if (isMixed) {
      const liquidRows = await supabase
        .from("highlights")
        .select("detail, expires_at")
        .eq("user_id", user.id)
        .eq("type", "pulse_liquid")
        .order("created_at", { ascending: false })
        .limit(2);

      const latestLiquid = liquidRows.data?.[0] ?? null;
      const freshLiquid =
        latestLiquid &&
        latestLiquid.expires_at > nowIso &&
        typeof latestLiquid.detail === "string" &&
        latestLiquid.detail.startsWith(PULSE_LIQUID_VER)
          ? latestLiquid
          : null;

      if (freshLiquid?.detail) {
        pulseLiquid = (freshLiquid.detail as string).slice(PULSE_LIQUID_VER.length);
      } else {
        const liquidActiveVitals = activeVitals.filter((v) => v.scope !== "house");
        const generated = await generatePulse(liquidActiveVitals, displayCurrency, "liquid");
        if (generated) {
          const jitterMs = Math.random() * 6 * 60 * 60 * 1000;
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000 + jitterMs).toISOString();
          const storedDetail = PULSE_LIQUID_VER + generated;
          const ins = await supabase.from("highlights").insert({
            user_id: user.id,
            type: "pulse_liquid",
            title: storedDetail,  // highlights.title is NOT NULL
            detail: storedDetail,
            expires_at: expiresAt,
            seen: false,
          }).select("id").single();
          // Prune superseded rows only AFTER the insert (fallback always survives).
          if (ins.data?.id) {
            await supabase.from("highlights").delete()
              .eq("user_id", user.id).eq("type", "pulse_liquid").neq("id", ins.data.id);
          }
          pulseLiquid = generated;
        } else {
          // Haiku failed — serve the most-recent prior liquid sentence.
          const rawDetail = (latestLiquid?.detail as string | null) ?? null;
          pulseLiquid = rawDetail
            ? rawDetail.startsWith(PULSE_LIQUID_VER)
              ? rawDetail.slice(PULSE_LIQUID_VER.length)
              : rawDetail
            : null;
        }
      }
    }

    const res = NextResponse.json({ pulse, pulseLiquid });

    res.headers.set("Cache-Control", "private, max-age=300, stale-while-revalidate=3600");

    return res;
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "GET /api/vitals/pulse" } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

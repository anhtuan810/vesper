import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { entitledGate } from "@/lib/require-entitled";
import type { Asset } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateEnv } from "@/lib/env";
import { generateInsight } from "@/lib/insight-generator";
import { parseMarketDetail } from "@/lib/market-highlights";
import {
  generatePortfolioInsights,
  valueToEur,
  type SnapshotRow,
  type AssetWithEur,
} from "@/lib/portfolio-insights";
import { getUsdRates } from "@/lib/fx";
import { bumpRateLimit } from "@/lib/rate-limit";
import { INSIGHT_FRESH_DAILY_LIMIT } from "@/lib/constants";

validateEnv();

const SNAPSHOT_LOOKBACK_DAYS = 35;

// Forced (post-mutation) refresh of the Portfolio band. Recomputes the
// concentration detectors from CURRENT assets and replaces the cached cards, so a
// removed or changed top position can never linger in the band. Clears the legacy
// "insight" card too, so the on-demand fallback below regenerates from current
// assets. Best-effort: any failure leaves the existing flow to serve what it can.
// The deterministic figure is always recomputed here; only the phrasing is cached.
async function regenPortfolioHighlights(supabase: SupabaseClient, userId: string): Promise<void> {
  try {
    await supabase.from("highlights").delete().eq("user_id", userId).in("type", ["portfolio", "insight"]);

    const { data: assets } = await supabase.from("assets").select("*").eq("user_id", userId).is("removed_at", null);
    if (!assets || assets.length === 0) return;

    const cutoffDate = new Date(Date.now() - SNAPSHOT_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
    const [userRow, snapRows, fxRates] = await Promise.all([
      supabase.from("users").select("display_currency").eq("id", userId).maybeSingle(),
      supabase.from("snapshots").select("date, breakdown").eq("user_id", userId).gte("date", cutoffDate),
      getUsdRates(),
    ]);

    const displayCurrency = (userRow.data?.display_currency as string | null) ?? "EUR";
    const snapshots = (snapRows.data ?? []) as SnapshotRow[];
    const assetsWithEur: AssetWithEur[] = (assets as Asset[]).map((a) => ({
      ...a,
      valueEur: valueToEur(a.value, a.currency ?? "USD", fxRates),
    }));

    const { insights } = await generatePortfolioInsights(assetsWithEur, displayCurrency, snapshots);
    if (insights.length === 0) return;

    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    await supabase.from("highlights").insert(
      insights.map((ins) => ({ user_id: userId, type: "portfolio", title: ins.title, detail: ins.detail, expires_at: expiresAt, seen: false })),
    );
  } catch (err) {
    console.warn("[insight] regenPortfolioHighlights failed:", err);
  }
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const gate = await entitledGate(supabase, user.id);
  if (gate) return gate;

  // A forced read (the client sends fresh=1 after a portfolio mutation, the same
  // signal holdings/Vitals refresh on) regenerates the band from current assets
  // BEFORE reading, so the cards below reflect the current top position.
  // Regeneration runs an LLM call, so cap forced refreshes per user per day; over
  // the cap we skip regeneration and serve the existing cached cards (never a
  // 429). Fails open (count == null → still regenerate) if the limiter is down.
  if (request.nextUrl.searchParams.get("fresh") === "1") {
    const count = await bumpRateLimit(supabase, user.id, "insight_fresh");
    if (count == null || count <= INSIGHT_FRESH_DAILY_LIMIT) {
      await regenPortfolioHighlights(supabase, user.id);
    }
  }

  const now = new Date().toISOString();

  // Fetch portfolio cards, insight fallback, and market highlights in parallel
  const [portfolioRes, insightRes, marketRes] = await Promise.all([
    supabase
      .from("highlights")
      .select("title, detail")
      .eq("user_id", user.id)
      .eq("type", "portfolio")
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("highlights")
      .select("title, detail, expires_at")
      .eq("user_id", user.id)
      .eq("type", "insight")
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("highlights")
      .select("id, title, detail")
      .eq("user_id", user.id)
      .eq("type", "market")
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const portfolioCards = (portfolioRes.data ?? [])
    .map((r) => ({ title: r.title ?? "", detail: r.detail ?? "" }))
    .filter((c) => c.detail);

  const market = (marketRes.data ?? []).map((row) => {
    const { text, impact_eur, symbol } = parseMarketDetail(row.detail ?? "");
    return { id: row.id, title: row.title ?? "", detail: text, impact_eur, symbol };
  });

  // If portfolio cards exist, return immediately — no need for legacy insight
  if (portfolioCards.length > 0) {
    return NextResponse.json({ insights: portfolioCards, insight: { detail: portfolioCards[0].detail }, market });
  }

  // Fall back to cached legacy insight
  if (insightRes.data?.detail) {
    return NextResponse.json({
      insights: [{ title: insightRes.data.title ?? "", detail: insightRes.data.detail }],
      insight: { detail: insightRes.data.detail, expires_at: insightRes.data.expires_at },
      market,
    });
  }

  // On-demand generation: fetch assets and run Haiku free-form insight
  const { data: assets } = await supabase
    .from("assets")
    .select("*")
    .eq("user_id", user.id)
    .is("removed_at", null)
    .order("value", { ascending: false });

  if (!assets || assets.length === 0) {
    return NextResponse.json({ insights: [], insight: { detail: null }, market });
  }

  const result = await generateInsight(assets);
  if (!result) {
    return NextResponse.json({ insights: [], insight: { detail: null }, market });
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from("highlights")
    .insert({ user_id: user.id, type: "insight", title: result.title, detail: result.detail, expires_at: expiresAt, seen: false });

  return NextResponse.json({ insights: [result], insight: { detail: result.detail, expires_at: expiresAt }, market });
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  await supabase.from("highlights").delete().eq("user_id", user.id).eq("type", "insight");

  return NextResponse.json({ ok: true });
}

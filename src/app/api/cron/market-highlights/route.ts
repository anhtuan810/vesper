import { NextRequest, NextResponse } from "next/server";
import { pushToUser } from "@/lib/apns";
import { createServerSupabase } from "@/lib/supabase";
import { fetchMarketHighlights, serializeMarketDetail, TRADEABLE_TYPES } from "@/lib/market-highlights";
import { generatePortfolioInsights, valueToEur, type SnapshotRow, type AssetWithEur } from "@/lib/portfolio-insights";
import { generateInsight } from "@/lib/insight-generator";
import { getUsdRates } from "@/lib/fx";
import type { Asset } from "@/lib/supabase";

const MIN_TRADEABLE_VALUE_EUR = 1000;
const SNAPSHOT_LOOKBACK_DAYS = 35;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabase();
  const now = new Date().toISOString();

  // Fetch ALL assets (portfolio detectors need non-tradeable types too)
  const { data: allAssets } = await supabase.from("assets").select("*").is("removed_at", null);
  if (!allAssets || allAssets.length === 0) {
    return NextResponse.json({ ok: true, users_processed: 0 });
  }

  // Group by user
  const byUser = new Map<string, Asset[]>();
  for (const asset of allAssets as Asset[]) {
    if (!byUser.has(asset.user_id)) byUser.set(asset.user_id, []);
    byUser.get(asset.user_id)!.push(asset);
  }

  const userIds = [...byUser.keys()];

  // Bulk-fetch user display_currency + recent snapshots
  const cutoffDate = new Date(Date.now() - SNAPSHOT_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const [userRows, snapshotRows, fxRates] = await Promise.all([
    supabase.from("users").select("id, display_currency").in("id", userIds),
    supabase.from("snapshots").select("user_id, date, breakdown").in("user_id", userIds).gte("date", cutoffDate),
    getUsdRates(),
  ]);

  const displayCurrencyByUser = new Map(
    (userRows.data ?? []).map((u) => [u.id, (u.display_currency as string | null) ?? "EUR"])
  );
  const snapshotsByUser = new Map<string, SnapshotRow[]>();
  for (const snap of snapshotRows.data ?? []) {
    if (!snapshotsByUser.has(snap.user_id)) snapshotsByUser.set(snap.user_id, []);
    snapshotsByUser.get(snap.user_id)!.push(snap as SnapshotRow);
  }

  let usersProcessed = 0;

  for (const [userId, assets] of byUser) {
    const tradeableValue = assets
      .filter((a) => TRADEABLE_TYPES.has(a.type))
      .reduce((sum, a) => sum + a.value, 0);
    if (tradeableValue < MIN_TRADEABLE_VALUE_EUR) continue;

    const displayCurrency = displayCurrencyByUser.get(userId) ?? "EUR";
    const snapshots = snapshotsByUser.get(userId) ?? [];

    try {
      // ── 1. Portfolio insight detectors ──────────────────────────────────────
      const assetsWithEur: AssetWithEur[] = assets.map((a) => ({
        ...(a as Asset),
        valueEur: valueToEur(a.value, a.currency ?? "USD", fxRates),
      }));

      const { detectorsFired, insights, inputTokens: haikuIn, outputTokens: haikuOut } =
        await generatePortfolioInsights(assetsWithEur, displayCurrency, snapshots);

      let portfolioRowsInserted = 0;
      let insightFallback = false;

      if (insights.length > 0) {
        for (const ins of insights) {
          const { data: existing } = await supabase
            .from("highlights")
            .select("id")
            .eq("user_id", userId)
            .eq("type", "portfolio")
            .eq("detail", ins.detail)
            .gt("expires_at", now)
            .maybeSingle();
          if (existing) continue;
          const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
          const { error } = await supabase.from("highlights").insert({
            user_id: userId, type: "portfolio", title: ins.title, detail: ins.detail,
            expires_at: expiresAt, seen: false,
          });
          if (!error) portfolioRowsInserted++;
          else console.error(`portfolio: insert error for ${userId}:`, error.message);
        }
      } else {
        // No detectors fired — fall back to Haiku free-form insight
        insightFallback = true;
        const { data: existingInsight } = await supabase
          .from("highlights").select("id").eq("user_id", userId).eq("type", "insight")
          .gt("expires_at", now).maybeSingle();
        if (!existingInsight) {
          const tradeable = assets.filter((a) => TRADEABLE_TYPES.has(a.type));
          const result = await generateInsight(tradeable.length > 0 ? tradeable : assets);
          if (result) {
            const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
            await supabase.from("highlights").insert({
              user_id: userId, type: "insight", title: result.title, detail: result.detail,
              expires_at: expiresAt, seen: false,
            });
          }
        }
      }

      // ── 2. Market highlights (unchanged) ────────────────────────────────────
      const tradeableAssets = assets.filter((a) => TRADEABLE_TYPES.has(a.type));
      const { highlights, inputTokens: sonnetIn, outputTokens: sonnetOut } =
        await fetchMarketHighlights(tradeableAssets);

      let marketRowsInserted = 0;
      for (const h of highlights) {
        const { data: existing } = await supabase
          .from("highlights").select("id").eq("user_id", userId).eq("type", "market")
          .eq("title", h.title).gt("expires_at", now).maybeSingle();
        if (existing) continue;
        const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
        const { error } = await supabase.from("highlights").insert({
          user_id: userId, type: "market", title: h.title, detail: serializeMarketDetail(h),
          expires_at: expiresAt, seen: false,
        });
        if (!error) marketRowsInserted++;
        else console.error(`market: insert error for ${userId}:`, error.message);
      }

      // Push at most one notification per user per run — the lead market
      // highlight, only when something fresh was inserted. No-op when APNs env
      // is unconfigured or the user has no registered devices.
      if (marketRowsInserted > 0 && highlights[0]) {
        await pushToUser(supabase, userId, {
          title: highlights[0].title,
          body: highlights[0].detail,
          link: "/diary",
        });
      }

      // ── Per-user log line ────────────────────────────────────────────────────
      console.log(JSON.stringify({
        user_id: userId,
        detectors_fired: detectorsFired,
        portfolio_rows_inserted: portfolioRowsInserted,
        insight_fallback: insightFallback,
        market_rows_inserted: marketRowsInserted,
        haiku_input_tokens: haikuIn,
        haiku_output_tokens: haikuOut,
        sonnet_input_tokens: sonnetIn,
        sonnet_output_tokens: sonnetOut,
      }));

      usersProcessed++;
    } catch (err) {
      console.error(`cron error for user ${userId}:`, err);
    }
  }

  return NextResponse.json({ ok: true, users_processed: usersProcessed });
}

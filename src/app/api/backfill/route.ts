import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getAuthUser } from "@/lib/supabase";
import { fetchHistoricalPrice, normalizePrice } from "@/lib/prices";
import { fetchYahooQuote } from "@/lib/prices-server";
import { resolveSymbol } from "@/lib/symbol-aliases";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;

    // Dispatch on job key if present; fall through to default price backfill otherwise.
    let body: Record<string, unknown> = {};
    try { const t = await req.text(); if (t) body = JSON.parse(t); } catch { /* no-op */ }
    if (body.job === "rename-tickers") return handleRenameTickersJob(userId);

    const supabase = createServerSupabase();

    const { data: userRow } = await supabase
      .from("users")
      .select("last_backfill_at")
      .eq("id", userId)
      .single();

    if (userRow?.last_backfill_at) {
      const ageMs = Date.now() - new Date(userRow.last_backfill_at).getTime();
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      if (ageMs < THIRTY_DAYS_MS) {
        return NextResponse.json({ updated: 0, skipped: true });
      }
    }

    // Load all user assets once
    const { data: allAssets } = await supabase
      .from("assets")
      .select("id, name, symbol, units, value, buy_date, buy_price")
      .eq("user_id", userId);

    const assetById = new Map((allAssets || []).map((a) => [a.id, a]));
    const assetByName = new Map((allAssets || []).map((a) => [a.name.toLowerCase(), a]));

    // Case 1: 'add' mutations with after_value = 0 or null
    // The asset's current value may already be non-zero (live prices updated it),
    // so we query mutations directly instead of filtering assets by value = 0.
    const { data: zeroAdds } = await supabase
      .from("mutations")
      .select("id, asset_id, asset_name, occurred_at")
      .eq("user_id", userId)
      .eq("action", "add")
      .or("after_value.eq.0,after_value.is.null");

    // Case 2: 'edit' mutations where before_value = after_value (zero-delta)
    // These occur when units were added but buy price was unknown, so value didn't change.
    const { data: zeroDeltaEdits } = await supabase
      .from("mutations")
      .select("id, asset_id, asset_name, occurred_at, before_value, after_value")
      .eq("user_id", userId)
      .eq("action", "edit")
      .not("before_value", "is", null)
      .not("after_value", "is", null);

    const zeroDeltaOnes = (zeroDeltaEdits || []).filter(
      (m) => m.before_value === m.after_value && m.before_value > 0
    );

    let updated = 0;

    const backfillMutation = async (
      mutation: { id: string; asset_id?: string | null; asset_name: string; occurred_at: string | null },
      isEdit: boolean
    ) => {
      const asset = mutation.asset_id
        ? assetById.get(mutation.asset_id)
        : assetByName.get(mutation.asset_name?.toLowerCase());

      if (!asset?.symbol || !asset?.units) return;

      const date = mutation.occurred_at || asset.buy_date || null;
      const priceData = await fetchHistoricalPrice(asset.symbol, date);
      if (!priceData) return;

      const p = normalizePrice(priceData.price, priceData.currency);
      const value = Math.round(p * asset.units);
      if (value === 0) return;

      await supabase.from("mutations").update({ after_value: value }).eq("id", mutation.id);

      // For add mutations: also fix asset value if still 0
      if (!isEdit && asset.value === 0) {
        await supabase.from("assets").update({
          value,
          buy_price: asset.buy_price || Math.round(p * 100) / 100,
        }).eq("id", asset.id);
      }

      updated++;
    };

    await Promise.all([
      ...(zeroAdds || []).map((m) => backfillMutation(m, false)),
      ...zeroDeltaOnes.map((m) => backfillMutation(m, true)),
    ]);

    if (updated > 0) {
      await supabase
        .from("users")
        .update({ last_backfill_at: new Date().toISOString() })
        .eq("id", userId);
    }
    return NextResponse.json({ updated });
  } catch (err) {
    console.error("Backfill error:", err);
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 });
  }
}

// ── rename-tickers job ────────────────────────────────────────────────────────
// Finds tradeable assets whose name looks like a bare ticker and renames them
// using Yahoo's longName/shortName. Writes no mutation rows (data correction).

const TICKER_RE = "^[A-Z0-9]{1,6}(\\.[A-Z]{1,4})?$";
const BATCH_LIMIT = 50;

async function handleRenameTickersJob(userId: string): Promise<NextResponse> {
  const supabase = createServerSupabase();

  const { data: candidates, error: selectError } = await supabase
    .from("assets")
    .select("id, name, symbol")
    .eq("user_id", userId)
    .in("type", ["stocks", "etf", "crypto", "gold"])
    .not("symbol", "is", null)
    .filter("name", "~", TICKER_RE);

  if (selectError) {
    console.error("rename-tickers select error:", selectError.message);
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  const all = candidates ?? [];
  const total = all.length;
  const batch = all.slice(0, BATCH_LIMIT);
  const cappedCount = total - batch.length;

  let renamed = 0;
  let skipped = cappedCount;
  let errors = 0;

  for (const asset of batch) {
    const sym = asset.symbol;
    if (!sym) { skipped++; continue; }

    const resolvedSym = resolveSymbol(sym) ?? sym;
    const quote = await fetchYahooQuote(resolvedSym);
    const canonicalName = (quote.longName ?? quote.shortName ?? "").trim();

    if (!canonicalName) { skipped++; continue; }

    const { error: updateError } = await supabase
      .from("assets")
      .update({ name: canonicalName, symbol: resolvedSym, updated_at: new Date().toISOString() })
      .eq("id", asset.id)
      .eq("user_id", userId);

    if (updateError) {
      console.error("rename-tickers update error:", asset.id, updateError.message);
      errors++;
    } else {
      renamed++;
    }
  }

  const result: Record<string, unknown> = { scanned: total, renamed, skipped, errors };
  if (cappedCount > 0) {
    result.note = `${cappedCount} asset(s) beyond the ${BATCH_LIMIT}-row cap were not processed — re-invoke to continue.`;
  }
  return NextResponse.json(result);
}

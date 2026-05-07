import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getAuthUser } from "@/lib/supabase";
import { fetchHistoricalPrice, normalizePrice } from "@/lib/prices";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;

    const supabase = createServerSupabase();

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

    return NextResponse.json({ updated });
  } catch (err) {
    console.error("Backfill error:", err);
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 });
  }
}

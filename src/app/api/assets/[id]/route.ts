import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getAuthUser } from "@/lib/supabase";
import { writeSnapshot } from "@/lib/snapshot";
import { geocodeAddress } from "@/lib/geocode";

const ALLOWED_COMMON = new Set([
  "name", "value", "currency", "country", "units", "buy_price", "buy_date",
]);

const ALLOWED_REAL_ESTATE = new Set([
  "address", "latitude", "longitude", "photo_url", "property_type",
  "size_sqm", "mortgage_balance", "mortgage_rate", "monthly_payment",
  "mortgage_type", "mortgage_start_date", "mortgage_end_date",
]);

const ALLOWED_BONDS = new Set([
  "coupon_rate", "maturity_date", "issuer", "isin",
]);

function computePortfolioTotal(
  assets: Array<{ type: string; value: number; mortgage_balance?: number | null }>
) {
  return assets.reduce((sum, a) => {
    const net =
      a.type === "real_estate" && a.mortgage_balance
        ? a.value - (a.mortgage_balance || 0)
        : a.value;
    return sum + net;
  }, 0);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const supabase = createServerSupabase();

    const { data: asset } = await supabase
      .from("assets")
      .select("*")
      .eq("id", id)
      .single();

    if (!asset || asset.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const allowed = new Set([
      ...ALLOWED_COMMON,
      ...(asset.type === "real_estate" ? ALLOWED_REAL_ESTATE : []),
      ...(asset.type === "bonds" ? ALLOWED_BONDS : []),
    ]);

    const updateData: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
      if (!allowed.has(key)) {
        return NextResponse.json({ error: `Field not allowed: ${key}` }, { status: 400 });
      }
      updateData[key] = body[key];
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data: updatedRaw, error: updateError } = await supabase
      .from("assets")
      .update(updateData)
      .eq("id", id)
      .select("*")
      .single();

    if (updateError || !updatedRaw) {
      console.error("PATCH asset error:", updateError);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    // Re-geocode when address changes on a real_estate asset
    let updated = updatedRaw;
    if ("address" in updateData && asset.type === "real_estate") {
      try {
        const geo = await geocodeAddress(updated.address, updated.country || asset.country || null);
        if (geo) {
          await supabase.from("assets").update({ latitude: geo.latitude, longitude: geo.longitude }).eq("id", id);
          updated = { ...updated, latitude: geo.latitude, longitude: geo.longitude };
        }
      } catch {
        // geocoding failure is non-fatal — leave existing coordinates
      }
    }

    const { data: allAssets } = await supabase
      .from("assets")
      .select("type, value, mortgage_balance")
      .eq("user_id", user.id);

    const portfolioTotal = computePortfolioTotal(allAssets || []);

    const { data: mutation, error: mutationError } = await supabase
      .from("mutations")
      .insert({
        user_id: user.id,
        asset_id: id,
        asset_name: asset.name,
        action: "edit",
        asset_type: asset.type,
        symbol: asset.symbol || null,
        before_value: asset.value,
        after_value: updated.value,
        before_units: asset.units ?? null,
        after_units: updated.units ?? null,
        currency: updated.currency || asset.currency,
        personal_context: null,
        portfolio_total: portfolioTotal,
        occurred_at: new Date().toISOString().split("T")[0],
      })
      .select("id")
      .single();

    if (mutationError) {
      Sentry.captureException(mutationError, {
        tags: { route: "PATCH /api/assets/[id]", invariant: "mutation_log" },
        extra: { user_id: user.id, asset_id: id },
      });
      return NextResponse.json(
        { asset: updated, mutation_id: null, warning: "diary_log_failed" },
        { status: 200 }
      );
    }

    writeSnapshot(user.id).catch((err) =>
      console.error("Snapshot background error:", err)
    );

    return NextResponse.json({ asset: updated, mutation_id: mutation?.id ?? null });
  } catch (err) {
    console.error("PATCH /api/assets/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const supabase = createServerSupabase();

    const { data: asset } = await supabase
      .from("assets")
      .select("*")
      .eq("id", id)
      .single();

    if (!asset || asset.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: allAssets } = await supabase
      .from("assets")
      .select("type, value, mortgage_balance")
      .eq("user_id", user.id);

    const totalBefore = computePortfolioTotal(allAssets || []);
    const assetNet =
      asset.type === "real_estate" && asset.mortgage_balance
        ? asset.value - (asset.mortgage_balance || 0)
        : asset.value;
    const portfolioTotal = totalBefore - assetNet;

    const { error: deleteError } = await supabase
      .from("assets")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("DELETE asset error:", deleteError);
      return NextResponse.json({ error: "Delete failed" }, { status: 500 });
    }

    const { error: mutationError } = await supabase
      .from("mutations")
      .insert({
        user_id: user.id,
        asset_id: null,
        asset_name: asset.name,
        action: "remove",
        asset_type: asset.type,
        symbol: asset.symbol || null,
        before_value: asset.value,
        after_value: null,
        before_units: asset.units ?? null,
        after_units: null,
        currency: asset.currency,
        personal_context: null,
        portfolio_total: portfolioTotal,
        occurred_at: new Date().toISOString().split("T")[0],
      });

    if (mutationError) {
      Sentry.captureException(mutationError, {
        tags: { route: "DELETE /api/assets/[id]", invariant: "mutation_log" },
        extra: { user_id: user.id, asset_id: id },
      });
      return NextResponse.json(
        { ok: true, warning: "diary_log_failed" },
        { status: 200 }
      );
    }

    writeSnapshot(user.id).catch((err) =>
      console.error("Snapshot background error:", err)
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/assets/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

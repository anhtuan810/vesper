import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse, after } from "next/server";
import { createServerSupabase, getAuthUser } from "@/lib/supabase";
import { writeSnapshot } from "@/lib/snapshot";
import { geocodeAddress } from "@/lib/geocode";
import { computeNetWorth } from "@/lib/utils";
import { fetchHistoricalPrice, normalizePrice } from "@/lib/prices";

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

const NUMERIC_NON_NEG = new Set([
  "value", "units", "mortgage_balance", "mortgage_rate",
  "monthly_payment", "buy_price", "size_sqm",
]);
const NUMERIC_ANY_SIGN = new Set(["latitude", "longitude"]);
const STRING_200 = new Set(["name", "address", "symbol"]);
const SUPPORTED_CURRENCIES = new Set(["EUR", "USD", "GBP", "CHF", "JPY", "CAD", "AUD", "HKD"]);
const STRING_8 = new Set(["country"]);
const DATE_FIELDS = new Set(["buy_date", "mortgage_start_date", "mortgage_end_date"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MORTGAGE_TYPES = new Set(["annuity", "linear", "interest_only"]);
const PROPERTY_TYPES = new Set(["apartment", "house", "office", "land", "other"]);
const TRADEABLE = new Set(["stocks", "etf", "crypto", "gold"]);

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

    // --- Input validation ---
    for (const [k, v] of Object.entries(updateData)) {
      if (NUMERIC_NON_NEG.has(k)) {
        if (typeof v !== "number" || !isFinite(v) || v < 0)
          return NextResponse.json({ error: `${k} must be a finite non-negative number` }, { status: 400 });
      } else if (NUMERIC_ANY_SIGN.has(k)) {
        if (typeof v !== "number" || !isFinite(v))
          return NextResponse.json({ error: `${k} must be a finite number` }, { status: 400 });
      } else if (STRING_200.has(k)) {
        if (typeof v !== "string" || v.trim().length === 0 || v.trim().length > 200)
          return NextResponse.json({ error: `${k} must be a non-empty string (max 200 chars)` }, { status: 400 });
      } else if (k === "currency") {
        if (typeof v !== "string")
          return NextResponse.json({ error: `currency must be one of: ${[...SUPPORTED_CURRENCIES].join(", ")}` }, { status: 400 });
        const normalized = v.trim().toUpperCase();
        if (!SUPPORTED_CURRENCIES.has(normalized))
          return NextResponse.json({ error: `currency must be one of: ${[...SUPPORTED_CURRENCIES].join(", ")}` }, { status: 400 });
        updateData[k] = normalized;
      } else if (STRING_8.has(k)) {
        if (typeof v !== "string" || v.trim().length === 0 || v.trim().length > 8)
          return NextResponse.json({ error: `${k} must be a non-empty string (max 8 chars)` }, { status: 400 });
      } else if (DATE_FIELDS.has(k)) {
        if (v !== null && (typeof v !== "string" || !DATE_RE.test(v)))
          return NextResponse.json({ error: `${k} must be a date string (YYYY-MM-DD) or null` }, { status: 400 });
      } else if (k === "mortgage_type") {
        if (v !== null && !MORTGAGE_TYPES.has(v as string))
          return NextResponse.json({ error: `mortgage_type must be one of: ${[...MORTGAGE_TYPES].join(", ")}` }, { status: 400 });
      } else if (k === "property_type") {
        if (v !== null && !PROPERTY_TYPES.has(v as string))
          return NextResponse.json({ error: `property_type must be one of: ${[...PROPERTY_TYPES].join(", ")}` }, { status: 400 });
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // Recompute value from live price when only units change on a tradeable asset
    if (
      "units" in updateData &&
      !("value" in updateData) &&
      TRADEABLE.has(asset.type) &&
      asset.symbol
    ) {
      try {
        const priceData = await fetchHistoricalPrice(asset.symbol, null);
        if (priceData) {
          const newUnits = updateData.units as number;
          updateData.value = Math.round(normalizePrice(priceData.price, priceData.currency) * newUnits);
        }
      } catch {
        // live-price fetch is non-fatal; leave value unchanged
      }
    }

    const { data: updatedRaw, error: updateError } = await supabase
      .from("assets")
      .update(updateData)
      .eq("id", id)
      .select("*")
      .single();

    if (updateError || !updatedRaw) {
      Sentry.captureException(updateError, {
        tags: { route: "PATCH /api/assets/[id]", step: "update" },
        extra: { user_id: user.id, asset_id: id },
      });
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

    const portfolioTotal = computeNetWorth(allAssets || []);

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

    after(() => writeSnapshot(user.id));

    return NextResponse.json({ asset: updated, mutation_id: mutation?.id ?? null });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "PATCH /api/assets/[id]" } });
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

    const totalBefore = computeNetWorth(allAssets || []);
    const portfolioTotal = totalBefore - computeNetWorth([asset]);

    const { error: deleteError } = await supabase
      .from("assets")
      .delete()
      .eq("id", id);

    if (deleteError) {
      Sentry.captureException(deleteError, {
        tags: { route: "DELETE /api/assets/[id]", step: "delete" },
        extra: { user_id: user.id, asset_id: id },
      });
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

    after(() => writeSnapshot(user.id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "DELETE /api/assets/[id]" } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

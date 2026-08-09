import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse, after } from "next/server";
import { createServerSupabase, getAuthUser } from "@/lib/supabase";
import { demoExpiredGate } from "@/lib/demo-session";
import { writeSnapshot, backfillSnapshots } from "@/lib/snapshot";
import { generateMarketSwings } from "@/lib/diary-market-moves";
import { computeNetWorth } from "@/lib/utils";
import { getUsdRates } from "@/lib/fx";

const ALLOWED_FIELDS = new Set([
  "type", "name", "value", "currency", "country", "symbol", "units",
  "buy_price", "buy_date", "buy_price_source",
  "address", "latitude", "longitude", "property_type", "size_sqm",
  "mortgage_balance", "mortgage_rate", "monthly_payment", "mortgage_type",
  "mortgage_start_date", "mortgage_end_date",
  "coupon_rate", "maturity_date", "issuer", "isin",
]);

const ASSET_TYPES = new Set([
  "stocks", "etf", "crypto", "bonds", "gold", "real_estate",
  "cash", "pension", "other",
]);

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Wall an expired demo turn before writing the asset + its mutation row.
    const demoGate = await demoExpiredGate(createServerSupabase(), user.id);
    if (demoGate) return demoGate;

    const body = await req.json();

    if (typeof body.type !== "string" || !ASSET_TYPES.has(body.type)) {
      return NextResponse.json({ error: "type is required and must be a valid asset type" }, { status: 400 });
    }
    if (typeof body.name !== "string" || body.name.trim().length === 0 || body.name.length > 200) {
      return NextResponse.json({ error: "name is required (max 200 chars)" }, { status: 400 });
    }
    if (typeof body.value !== "number" || !isFinite(body.value) || body.value < 0) {
      return NextResponse.json({ error: "value must be a finite non-negative number" }, { status: 400 });
    }

    const insertData: Record<string, unknown> = { user_id: user.id };
    for (const key of Object.keys(body)) {
      if (ALLOWED_FIELDS.has(key)) insertData[key] = body[key];
    }

    const supabase = createServerSupabase();
    const { data: created, error: insertError } = await supabase
      .from("assets")
      .insert(insertData)
      .select("*")
      .single();

    if (insertError || !created) {
      Sentry.captureException(insertError, {
        tags: { route: "POST /api/assets", step: "insert" },
        extra: { user_id: user.id },
      });
      return NextResponse.json({ error: "Create failed" }, { status: 500 });
    }

    const { data: allAssets } = await supabase
      .from("assets")
      // pension_kind is needed so computeNetWorth can exclude income (db/state)
      // pension entitlements; the amortisation fields let it use the CURRENT
      // mortgage balance for real-estate equity, matching every other net-worth
      // read. Omitting them mis-valued the recorded portfolio_total.
      .select("type, value, currency, mortgage_balance, mortgage_balance_recorded_at, mortgage_rate, monthly_payment, mortgage_type, pension_kind")
      .eq("user_id", user.id)
      .is("removed_at", null);
    const usdRates = await getUsdRates();
    const toUsdSync = (amount: number, currency: string) => {
      if (currency === "USD") return amount;
      const rate = usdRates[currency];
      return rate ? amount / rate : amount;
    };
    const portfolioTotal = computeNetWorth(allAssets || [], toUsdSync);

    // Anchor the restored "add" to the position's real acquisition date, not the
    // restore moment — mirrors the chat add path (apply-changes.ts). Otherwise a
    // position bought long ago comes back stamped "today", which lands the journal
    // entry on today and (below) leaves the net-worth line without any history.
    const todayStr = new Date().toISOString().split("T")[0];
    const buyDate = typeof created.buy_date === "string" ? created.buy_date.slice(0, 10) : null;
    const occurredAt = buyDate || todayStr;

    // Record the acquisition amount the same way the chat add path does: a
    // property's purchase price (buy_price) when known, the stated value
    // otherwise. Mirrors apply-changes so a restored asset's journal/Overview
    // entry reads the same as a freshly-added one.
    const acquisitionValue =
      created.type === "real_estate" && typeof created.buy_price === "number" && created.buy_price > 0
        ? created.buy_price
        : created.value;

    const { data: mutation } = await supabase
      .from("mutations")
      .insert({
        user_id: user.id,
        asset_id: created.id,
        asset_name: created.name,
        action: "add",
        asset_type: created.type,
        symbol: created.symbol || null,
        before_value: null,
        after_value: acquisitionValue,
        before_units: null,
        after_units: created.units ?? null,
        currency: created.currency || "EUR",
        personal_context: "Restored after delete",
        portfolio_total: portfolioTotal,
        occurred_at: occurredAt,
      })
      .select("id")
      .single();

    after(() => writeSnapshot(user.id));
    // A past acquisition date means the reconstructed history has to be rebuilt
    // to include this holding — the same rebuild the chat path runs. Without it,
    // restoring a years-old position leaves the graph a single dot.
    if (buyDate && buyDate < todayStr) {
      after(() => backfillSnapshots(user.id));
    }
    // Logging an asset (esp. one bought long ago) can surface new historical
    // market swings — regenerate them in the background so the user never waits.
    after(() => generateMarketSwings(user.id));

    return NextResponse.json({ asset: created, mutation_id: mutation?.id ?? null });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "POST /api/assets" } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

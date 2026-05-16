import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse, after } from "next/server";
import { createServerSupabase, getAuthUser } from "@/lib/supabase";
import { writeSnapshot } from "@/lib/snapshot";
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
      .select("type, value, currency, mortgage_balance")
      .eq("user_id", user.id);
    const usdRates = await getUsdRates();
    const toUsdSync = (amount: number, currency: string) => {
      if (currency === "USD") return amount;
      const rate = usdRates[currency];
      return rate ? amount / rate : amount;
    };
    const portfolioTotal = computeNetWorth(allAssets || [], toUsdSync);

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
        after_value: created.value,
        before_units: null,
        after_units: created.units ?? null,
        currency: created.currency || "EUR",
        personal_context: "Restored after delete",
        portfolio_total: portfolioTotal,
        occurred_at: new Date().toISOString().split("T")[0],
      })
      .select("id")
      .single();

    after(() => writeSnapshot(user.id));

    return NextResponse.json({ asset: created, mutation_id: mutation?.id ?? null });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "POST /api/assets" } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { getUsdRates, getHistoricalUsdRates } from "@/lib/fx";
import { fetchHistoricalSeries } from "@/lib/prices";
import { computeReadout, type ScenarioAsset } from "@/lib/scenario/engine";
import {
  reconstructPositionSeries,
  counterfactualRemove,
  contribution,
  type CurvePoint,
  type UnitsPoint,
  type CashFlow,
} from "@/lib/scenario/counterfactual";

// Past-counterfactual is defined for held tradeables only.
const TRADEABLE_TYPES = new Set(["stocks", "etf", "crypto"]);

const RANGE_DAYS: Record<string, number> = { "1M": 30, "3M": 90, "1Y": 365, "3Y": 1095 };

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

// POST /api/scenarios/counterfactual { asset_id, range }
// Reconstructs net worth as if a held tradeable had never existed. Read-only.
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { asset_id?: unknown; range?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const assetId = typeof body.asset_id === "string" ? body.asset_id : null;
  if (!assetId) return NextResponse.json({ error: "asset_id is required" }, { status: 400 });
  const range = typeof body.range === "string" ? body.range : "All";

  const supabase = createServerSupabase();

  const { data: assetRows } = await supabase
    .from("assets")
    .select(
      "id, name, type, value, currency, units, symbol, mortgage_balance, mortgage_balance_recorded_at, mortgage_rate, monthly_payment, mortgage_type",
    )
    .eq("user_id", user.id);
  const allAssets = (assetRows ?? []) as Array<ScenarioAsset & { units?: number | null; symbol?: string | null }>;
  const target = allAssets.find((a) => a.id === assetId);

  if (!target) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  if (!TRADEABLE_TYPES.has(target.type)) {
    return NextResponse.json(
      { error: `Counterfactual is only supported for tradeable positions (stocks, ETFs, crypto); "${target.type}" is not supported.` },
      { status: 400 },
    );
  }
  if (!target.symbol) {
    return NextResponse.json({ error: "Position has no symbol; cannot fetch historical prices." }, { status: 400 });
  }

  const usdRates = await getUsdRates();
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // ── Actual curve: snapshots + today's live net worth ──────────────────────
  const { data: snapRows } = await supabase
    .from("snapshots")
    .select("date, total_value")
    .eq("user_id", user.id)
    .order("date", { ascending: true });

  const liveNetWorthUsd = computeReadout(allAssets as ScenarioAsset[], usdRates, now).netWorthUsd;
  const byDate = new Map<string, number>();
  for (const s of snapRows ?? []) byDate.set(s.date as string, Number(s.total_value));
  byDate.set(todayStr, liveNetWorthUsd); // today is the live value
  let actualCurve: CurvePoint[] = [...byDate.entries()]
    .map(([date, valueUsd]) => ({ date, valueUsd }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const rangeDays = RANGE_DAYS[range];
  if (rangeDays) {
    const cutoff = isoDaysAgo(rangeDays);
    const filtered = actualCurve.filter((p) => p.date >= cutoff);
    actualCurve = filtered.length > 0 ? filtered : actualCurve.slice(-1);
  }

  // ── Units over time from the mutation log (best-effort) ───────────────────
  const { data: mutRows } = await supabase
    .from("mutations")
    .select(
      "occurred_at, action, before_units, after_units, before_value, after_value, currency, personal_context, market_context, symbol, asset_name",
    )
    .eq("user_id", user.id)
    .eq("asset_id", assetId)
    .order("occurred_at", { ascending: true });
  const muts = mutRows ?? [];

  const canTimeline =
    muts.length > 0 && muts.every((m) => m.action === "remove" || typeof m.after_units === "number");
  const units: UnitsPoint[] | number = canTimeline
    ? muts.map((m) => ({
        date: m.occurred_at as string,
        units: m.action === "remove" ? 0 : (m.after_units as number),
      }))
    : typeof target.units === "number"
    ? target.units
    : 0;

  // Buy/sell cash flows: per mutation, the native value added (buy, +) or removed
  // (sell, −), approximating cost/proceeds as the value change at the event.
  const cashFlows: CashFlow[] = [];
  for (const mu of muts) {
    const amount = Number(mu.after_value ?? 0) - Number(mu.before_value ?? 0);
    if (amount !== 0) {
      cashFlows.push({ date: mu.occurred_at as string, amount, currency: (mu.currency as string) || "USD" });
    }
  }

  // ── Historical price + FX series over the curve + flow window ─────────────
  const earliestCurve = actualCurve[0]?.date ?? todayStr;
  const earliestFlow = muts[0]?.occurred_at as string | undefined;
  const earliest = earliestFlow && earliestFlow < earliestCurve ? earliestFlow : earliestCurve;
  const fromBuffered = isoDaysAgo(Math.ceil((Date.now() - Date.parse(earliest)) / 86_400_000) + 7);

  const [priceSeriesRaw, fxSeries] = await Promise.all([
    fetchHistoricalSeries(target.symbol, fromBuffered, todayStr),
    getHistoricalUsdRates(fromBuffered, todayStr),
  ]);
  const priceSeries = priceSeriesRaw ?? [];

  // ── Compute ───────────────────────────────────────────────────────────────
  const dates = actualCurve.map((p) => p.date);
  const position = reconstructPositionSeries(dates, units, priceSeries, fxSeries);
  const counterfactual = counterfactualRemove(actualCurve, position.series, cashFlows, fxSeries);

  const actualToday = actualCurve[actualCurve.length - 1]?.valueUsd ?? 0;
  const cfToday = counterfactual.series[counterfactual.series.length - 1]?.valueUsd ?? 0;
  const contrib = contribution(actualToday, cfToday);

  const assumptions = [
    `Range: ${range}.`,
    ...position.assumptions,
    ...counterfactual.assumptions,
    ...contrib.assumptions,
  ];

  return NextResponse.json({
    asset: { id: target.id, name: target.name, symbol: target.symbol, type: target.type },
    actualSeries: actualCurve,
    counterfactualSeries: counterfactual.series,
    contribution: contrib.valueUsd,
    assumptions,
    // Raw diary context — captured reasoning, not narrated/summarised.
    diaryContext: muts.map((m) => ({
      occurred_at: m.occurred_at,
      action: m.action,
      before_units: m.before_units,
      after_units: m.after_units,
      before_value: m.before_value,
      after_value: m.after_value,
      currency: m.currency,
      symbol: m.symbol,
      asset_name: m.asset_name,
      personal_context: m.personal_context,
      market_context: m.market_context,
    })),
  });
}

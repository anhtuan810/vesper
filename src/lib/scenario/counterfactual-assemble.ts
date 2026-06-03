// Shared assembly for the past-counterfactual: fetches the user's real series and
// runs the pure engine. Used by both POST /api/scenarios/counterfactual and the
// chat scenario-intent branch, so both go through one read-only path. Writes nothing.

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
import type { createServerSupabase } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createServerSupabase>;

const TRADEABLE_TYPES = new Set(["stocks", "etf", "crypto"]);
const RANGE_DAYS: Record<string, number> = { "1M": 30, "3M": 90, "1Y": 365, "3Y": 1095 };
const isoDaysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

export interface DiaryContextEntry {
  occurred_at: string | null;
  action: string | null;
  before_units: number | null;
  after_units: number | null;
  before_value: number | null;
  after_value: number | null;
  currency: string | null;
  symbol: string | null;
  asset_name: string | null;
  personal_context: string | null;
  market_context: string | null;
}

export interface CounterfactualData {
  asset: { id: string; name: string; symbol: string; type: string };
  actualSeries: CurvePoint[];
  counterfactualSeries: CurvePoint[];
  contribution: number;
  assumptions: string[];
  diaryContext: DiaryContextEntry[];
}

export type CounterfactualOutcome =
  | { ok: true; data: CounterfactualData }
  | { ok: false; reason: "not_found" | "not_tradeable" | "no_symbol"; message: string };

export async function assembleCounterfactual(
  supabase: SupabaseClient,
  userId: string,
  assetId: string,
  range: string,
): Promise<CounterfactualOutcome> {
  const { data: assetRows } = await supabase
    .from("assets")
    .select(
      "id, name, type, value, currency, units, symbol, mortgage_balance, mortgage_balance_recorded_at, mortgage_rate, monthly_payment, mortgage_type",
    )
    .eq("user_id", userId);
  const allAssets = (assetRows ?? []) as Array<ScenarioAsset & { units?: number | null; symbol?: string | null }>;
  const target = allAssets.find((a) => a.id === assetId);

  if (!target) return { ok: false, reason: "not_found", message: "Asset not found." };
  if (!TRADEABLE_TYPES.has(target.type)) {
    return {
      ok: false,
      reason: "not_tradeable",
      message: `Counterfactual is only supported for tradeable positions (stocks, ETFs, crypto); "${target.type}" is not supported.`,
    };
  }
  if (!target.symbol) {
    return { ok: false, reason: "no_symbol", message: "Position has no symbol; cannot fetch historical prices." };
  }

  const usdRates = await getUsdRates();
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Actual curve: snapshots + today's live net worth.
  const { data: snapRows } = await supabase
    .from("snapshots")
    .select("date, total_value")
    .eq("user_id", userId)
    .order("date", { ascending: true });

  const liveNetWorthUsd = computeReadout(allAssets as ScenarioAsset[], usdRates, now).netWorthUsd;
  const byDate = new Map<string, number>();
  for (const s of snapRows ?? []) byDate.set(s.date as string, Number(s.total_value));
  byDate.set(todayStr, liveNetWorthUsd);
  let actualCurve: CurvePoint[] = [...byDate.entries()]
    .map(([date, valueUsd]) => ({ date, valueUsd }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const rangeDays = RANGE_DAYS[range];
  if (rangeDays) {
    const cutoff = isoDaysAgo(rangeDays);
    const filtered = actualCurve.filter((p) => p.date >= cutoff);
    actualCurve = filtered.length > 0 ? filtered : actualCurve.slice(-1);
  }

  // Units over time + buy/sell cash flows from the mutation log (best-effort).
  const { data: mutRows } = await supabase
    .from("mutations")
    .select(
      "occurred_at, action, before_units, after_units, before_value, after_value, currency, personal_context, market_context, symbol, asset_name",
    )
    .eq("user_id", userId)
    .eq("asset_id", assetId)
    .order("occurred_at", { ascending: true });
  const muts = (mutRows ?? []) as DiaryContextEntry[];

  const canTimeline =
    muts.length > 0 && muts.every((m) => m.action === "remove" || typeof m.after_units === "number");
  const units: UnitsPoint[] | number = canTimeline
    ? muts.map((m) => ({ date: m.occurred_at as string, units: m.action === "remove" ? 0 : (m.after_units as number) }))
    : typeof target.units === "number"
    ? target.units
    : 0;

  const cashFlows: CashFlow[] = [];
  for (const mu of muts) {
    const amount = Number(mu.after_value ?? 0) - Number(mu.before_value ?? 0);
    if (amount !== 0) cashFlows.push({ date: mu.occurred_at as string, amount, currency: (mu.currency as string) || "USD" });
  }

  // Historical price + FX series over the curve + flow window.
  const earliestCurve = actualCurve[0]?.date ?? todayStr;
  const earliestFlow = muts[0]?.occurred_at as string | undefined;
  const earliest = earliestFlow && earliestFlow < earliestCurve ? earliestFlow : earliestCurve;
  const fromBuffered = isoDaysAgo(Math.ceil((Date.now() - Date.parse(earliest)) / 86_400_000) + 7);

  const [priceSeriesRaw, fxSeries] = await Promise.all([
    fetchHistoricalSeries(target.symbol, fromBuffered, todayStr),
    getHistoricalUsdRates(fromBuffered, todayStr),
  ]);
  const priceSeries = priceSeriesRaw ?? [];

  const dates = actualCurve.map((p) => p.date);
  const position = reconstructPositionSeries(dates, units, priceSeries, fxSeries);
  const counterfactual = counterfactualRemove(actualCurve, position.series, cashFlows, fxSeries);

  const actualToday = actualCurve[actualCurve.length - 1]?.valueUsd ?? 0;
  const cfToday = counterfactual.series[counterfactual.series.length - 1]?.valueUsd ?? 0;
  const contrib = contribution(actualToday, cfToday);

  return {
    ok: true,
    data: {
      asset: { id: target.id, name: target.name, symbol: target.symbol, type: target.type },
      actualSeries: actualCurve,
      counterfactualSeries: counterfactual.series,
      contribution: contrib.valueUsd,
      assumptions: [`Range: ${range}.`, ...position.assumptions, ...counterfactual.assumptions, ...contrib.assumptions],
      diaryContext: muts,
    },
  };
}

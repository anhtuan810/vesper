// Deterministic past-counterfactual engine. Pure functions — all series are
// passed in; no I/O, no model produces any figure. Reconstructs a held tradeable
// position's USD value over time from real historical prices and historical FX,
// then removes it from the actual net-worth curve to isolate its contribution.

import { normalizePrice } from "@/lib/prices";

export interface CurvePoint {
  date: string; // YYYY-MM-DD
  valueUsd: number;
}
export interface UnitsPoint {
  date: string; // units as held from this date forward
  units: number;
}
export interface PricePoint {
  date: string;
  price: number; // native currency close
  currency: string;
}
/** date → { quote: rate } where rate = 1 USD = N quote (frankfurter shape). */
export type FxByDate = Record<string, Record<string, number>>;

// Most recent price entry on or before `date` (sorted-ascending walk).
// Mirrors the priceAtOrBefore helper in src/lib/snapshot.ts.
function priceAtOrBefore(series: PricePoint[], date: string): PricePoint | null {
  let result: PricePoint | null = null;
  for (const p of series) {
    if (p.date > date) break;
    result = p;
  }
  return result;
}

// Units held as of `date` by walking a sorted-ascending units timeline; 0 if no
// entry precedes the date. Mirrors unitsAtDate in src/lib/snapshot.ts.
function unitsAtDate(timeline: UnitsPoint[], date: string): number {
  let units = 0;
  for (const u of timeline) {
    if (u.date > date) break;
    units = u.units;
  }
  return units;
}

// FX rate (quote per 1 USD) on or before `date`; falls back to the earliest
// available date when the target precedes all available FX data.
function fxRateAtOrBefore(fx: FxByDate, date: string, quote: string): number | null {
  const dates = Object.keys(fx).sort();
  if (dates.length === 0) return null;
  let chosen: string | null = null;
  for (const d of dates) {
    if (d > date) break;
    chosen = d;
  }
  if (!chosen) chosen = dates[0];
  const r = fx[chosen]?.[quote];
  return typeof r === "number" ? r : null;
}

/**
 * Position value in USD at each requested date. Units come from a timeline (step
 * function) or a constant; price is the daily close on/before each date; FX is
 * applied per date. Before the position existed (units 0) the value is 0.
 */
export function reconstructPositionSeries(
  dates: string[],
  units: UnitsPoint[] | number,
  priceSeries: PricePoint[],
  fxSeries: FxByDate,
): { series: CurvePoint[]; assumptions: string[] } {
  const sortedPrices = [...priceSeries].sort((a, b) => a.date.localeCompare(b.date));
  const sortedUnits = typeof units === "number" ? null : [...units].sort((a, b) => a.date.localeCompare(b.date));
  let fxMissing = false;
  let priceMissing = false;

  const series: CurvePoint[] = dates.map((date) => {
    const u: number = sortedUnits ? unitsAtDate(sortedUnits, date) : (units as number);
    if (u === 0) return { date, valueUsd: 0 };
    const p = priceAtOrBefore(sortedPrices, date);
    if (!p) { priceMissing = true; return { date, valueUsd: 0 }; }
    const cur = p.currency === "GBp" ? "GBP" : p.currency;
    const native = u * normalizePrice(p.price, p.currency);
    if (cur === "USD") return { date, valueUsd: native };
    const rate = fxRateAtOrBefore(fxSeries, date, cur);
    if (rate == null || rate === 0) { fxMissing = true; return { date, valueUsd: native }; }
    return { date, valueUsd: native / rate };
  });

  const assumptions = [
    "Daily closing prices: most recent close on or before each date.",
    "Historical FX applied per date.",
    typeof units === "number"
      ? `Units assumed constant at the current holding (${units}).`
      : "Units reconstructed from the mutation log over time.",
  ];
  if (priceMissing) assumptions.push("Price history unavailable for some dates; position valued at 0 there.");
  if (fxMissing) assumptions.push("FX unavailable for some dates; native value used unconverted there.");
  return { series, assumptions };
}

/**
 * A buy or sell of the position, recovered from the mutation log. `amount` is the
 * signed native cash flow: a buy is the positive cost deployed, a sell is the
 * negative proceeds returned. Converted to USD at the deployment-date FX.
 */
export interface CashFlow {
  date: string;
  amount: number; // native currency; buy > 0 (cost), sell < 0 (proceeds)
  currency: string;
}

// Net capital still deployed as of `date`, in USD valued at each flow's
// deployment-date FX and held flat (no return on the cash): cumulative buy cost
// minus cumulative sell proceeds, over flows up to `date`.
function netCashKeptAtDate(flows: CashFlow[], date: string, fxSeries: FxByDate): number {
  let sum = 0;
  for (const f of flows) {
    if (f.date > date) break; // flows are pre-sorted ascending
    const cur = f.currency === "GBp" ? "GBP" : f.currency;
    if (cur === "USD") { sum += f.amount; continue; }
    const rate = fxRateAtOrBefore(fxSeries, f.date, cur);
    sum += rate && rate !== 0 ? f.amount / rate : f.amount;
  }
  return sum;
}

/**
 * Counterfactual net-worth curve for "never bought": the position's value is
 * removed, but the capital the user deployed is kept as cash (held flat), so the
 * comparison isolates gain/loss rather than market value.
 *   cf(date) = actual(date) − positionValue(date) + netCashKept(date)
 * Before the position existed both terms are zero, so cf equals actual.
 */
export function counterfactualRemove(
  actualCurve: CurvePoint[],
  positionSeries: CurvePoint[],
  cashFlows: CashFlow[] = [],
  fxSeries: FxByDate = {},
): { series: CurvePoint[]; assumptions: string[] } {
  const posByDate = new Map(positionSeries.map((p) => [p.date, p.valueUsd]));
  const flows = [...cashFlows].sort((a, b) => a.date.localeCompare(b.date));
  const series = actualCurve.map((a) => ({
    date: a.date,
    valueUsd: a.valueUsd - (posByDate.get(a.date) ?? 0) + netCashKeptAtDate(flows, a.date, fxSeries),
  }));
  return {
    series,
    assumptions: [
      "Counterfactual net worth = actual − the position's value + the capital you deployed, kept as cash.",
      "Capital kept as cash, valued in USD at the deployment-date FX and held flat (no return on the cash).",
      "Before the position existed, both its value and the kept cash are zero, so the counterfactual equals actual.",
    ],
  };
}

/**
 * Contribution today = actual − counterfactual today. With capital kept as cash,
 * this equals the position's lifetime gain/loss (current value + sell proceeds −
 * buy cost) versus what was invested, and can be negative.
 */
export function contribution(
  actualToday: number,
  counterfactualToday: number,
): { valueUsd: number; assumptions: string[] } {
  return {
    valueUsd: actualToday - counterfactualToday,
    assumptions: ["Contribution = the position's gain or loss versus the capital you deployed (negative if underwater)."],
  };
}

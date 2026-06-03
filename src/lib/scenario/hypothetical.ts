// Deterministic hypothetical-acquisition engine. Pure functions — all series are
// passed in; no I/O, no model produces any figure. Models the standalone growth of
// a hypothetical past purchase ("€X in Y on date Z"): how that single investment
// would have grown to today, NOT a change to the user's real net worth.

import { normalizePrice } from "@/lib/prices";
import type { CurvePoint, PricePoint, FxByDate } from "@/lib/scenario/counterfactual";

export interface HypotheticalBuyResult {
  /** USD value of the position from the (effective) buy date to today. */
  series: CurvePoint[];
  /** The buy date actually used — equals the requested date unless clamped to the earliest data. */
  buyDateUsed: string;
  amountUsd: number;
  valueTodayUsd: number;
  gainUsd: number;
  multiple: number;
  assumptions: string[];
}

// Most recent price entry on or before `date` (sorted-ascending walk).
function priceAtOrBefore(series: PricePoint[], date: string): PricePoint | null {
  let result: PricePoint | null = null;
  for (const p of series) {
    if (p.date > date) break;
    result = p;
  }
  return result;
}

// First price entry on or after `date`.
function priceAtOrAfter(series: PricePoint[], date: string): PricePoint | null {
  for (const p of series) {
    if (p.date >= date) return p;
  }
  return null;
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

// Native close → USD at the per-date FX. Tracks whether FX was missing.
function closeToUsd(p: PricePoint, date: string, fx: FxByDate): { usd: number; fxMissing: boolean } {
  const cur = p.currency === "GBp" ? "GBP" : p.currency;
  const native = normalizePrice(p.price, p.currency);
  if (cur === "USD") return { usd: native, fxMissing: false };
  const rate = fxRateAtOrBefore(fx, date, cur);
  if (rate == null || rate === 0) return { usd: native, fxMissing: true };
  return { usd: native / rate, fxMissing: false };
}

/**
 * USD close price used for a buy on `buyDate`: the close on/before the date, else
 * the earliest available close. Returns the price and the date actually used (which
 * the caller can compare against the request to detect a clamp). Powers the
 * units-based path (amountUsd = units × buyPriceUsd).
 */
export function buyPriceUsd(
  priceSeries: PricePoint[],
  fxSeries: FxByDate,
  buyDate: string,
): { priceUsd: number; dateUsed: string } | null {
  const sorted = [...priceSeries].sort((a, b) => a.date.localeCompare(b.date));
  const point = priceAtOrBefore(sorted, buyDate) ?? priceAtOrAfter(sorted, buyDate);
  if (!point) return null;
  const { usd } = closeToUsd(point, point.date, fxSeries);
  if (usd <= 0) return null;
  return { priceUsd: usd, dateUsed: point.date };
}

/**
 * Growth of a hypothetical purchase of `amountUsd` of an asset on `buyDate`.
 * unitsBought = amountUsd / (close at buy, in USD); for each close on/after the buy
 * date, value(t) = unitsBought × close(t) in USD. The series starts at the buy date
 * (nothing before it). gain = value today − amount; multiple = value today / amount.
 */
export function hypotheticalBuyGrowth(
  amountUsd: number,
  buyDate: string,
  priceSeries: PricePoint[],
  fxSeries: FxByDate,
): HypotheticalBuyResult {
  const sorted = [...priceSeries].sort((a, b) => a.date.localeCompare(b.date));

  // The buy executes at the close on/before the requested date, else the earliest
  // available close (the route clamps the date, but stay robust here too).
  const buyPoint = priceAtOrBefore(sorted, buyDate) ?? priceAtOrAfter(sorted, buyDate);
  if (!buyPoint) {
    return {
      series: [], buyDateUsed: buyDate, amountUsd, valueTodayUsd: 0,
      gainUsd: -amountUsd, multiple: 0,
      assumptions: ["Price history unavailable for this asset and date."],
    };
  }

  const buyDateUsed = buyPoint.date;
  const { usd: buyUsd } = closeToUsd(buyPoint, buyDateUsed, fxSeries);
  if (buyUsd <= 0) {
    return {
      series: [], buyDateUsed, amountUsd, valueTodayUsd: 0,
      gainUsd: -amountUsd, multiple: 0,
      assumptions: ["No usable price at the buy date."],
    };
  }
  const unitsBought = amountUsd / buyUsd;

  let fxMissing = false;
  const series: CurvePoint[] = sorted
    .filter((p) => p.date >= buyDateUsed)
    .map((p) => {
      const conv = closeToUsd(p, p.date, fxSeries);
      if (conv.fxMissing) fxMissing = true;
      return { date: p.date, valueUsd: unitsBought * conv.usd };
    });

  const valueTodayUsd = series.length ? series[series.length - 1].valueUsd : amountUsd;
  const gainUsd = valueTodayUsd - amountUsd;
  const multiple = amountUsd > 0 ? valueTodayUsd / amountUsd : 0;

  const assumptions = [
    "Standalone growth of a hypothetical purchase — not a change to your net worth.",
    "Daily closing prices: most recent close on or before each date.",
    "Historical FX applied per date.",
    "Lump-sum buy held untouched; no fees, taxes, or further contributions.",
  ];
  if (fxMissing) assumptions.push("FX unavailable for some dates; native value used unconverted there.");

  return { series, buyDateUsed, amountUsd, valueTodayUsd, gainUsd, multiple, assumptions };
}

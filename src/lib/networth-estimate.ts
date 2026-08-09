// Instant, client-side PLACEHOLDER history for just-added, back-dated assets.
//
// When a user adds an asset whose purchase date is in the past (a house bought
// years ago, say), today's net worth jumps but the stored snapshot points were
// computed before the asset existed — so the graph shows a flat line then a
// spike until the server's accurate reconstruction (backfillSnapshots) lands.
// This module fills that gap on the client: it ramps each un-historized asset's
// value back across time with rough interpolation (linear value; property equity
// via the pure mortgage schedule) and folds it into the existing real history,
// so the graph reads as "built" the instant the asset is saved. The accurate
// curve replaces it the moment the reconstruction lands.
//
// The interpolation is DELIBERATELY rough — a straight line between the two
// facts we actually know (bought at buy_price on buy_date, worth currentValue
// today), mortgage held flat. It is a placeholder, clearly labelled as an
// estimate in the UI, never persisted, and never used for any figure the user
// acts on. See docs/technical-decisions.md.
//
// Pure (no React/DOM/network) so scripts/verify-networth-estimate.ts can
// exercise it in isolation.

import { computeCurrentBalance } from "@/lib/mortgage";

// The graph never reconstructs further back than this — the longest a mortgage
// runs, so a legitimately old asset still shows a full lifetime while a
// data-entry typo (a house "bought" in 1850) can't generate centuries of points.
export const MAX_HISTORY_YEARS = 30;

// Clamp a history start date so it begins at most MAX_HISTORY_YEARS before today.
export function clampHistoryStart(earliest: string, todayStr: string): string {
  const floor = new Date(todayStr + "T00:00:00Z");
  floor.setUTCFullYear(floor.getUTCFullYear() - MAX_HISTORY_YEARS);
  const floorStr = floor.toISOString().slice(0, 10);
  return earliest < floorStr ? floorStr : earliest;
}

// Minimal shape needed to estimate one asset. Amounts are all in ONE currency
// (the caller's choice — the wiring passes display-currency figures); rate is a
// percent, unit-free.
export interface EstimableAsset {
  buyDate: string; // YYYY-MM-DD
  buyPrice: number; // falls back to currentValue when unknown/zero upstream
  currentValue: number;
  // Real-estate mortgage; omit/null for anything else.
  mortgage?: {
    balance: number;
    recordedAt?: string | null;
    rate?: number | null;
    monthlyPayment?: number | null;
    type?: string | null;
  } | null;
}

function parseDay(d: string): number {
  return Date.parse((d.length > 10 ? d : d + "T12:00:00Z"));
}

// Fraction (0..1) of the buy→today span reached by `date`. 0 before buy_date,
// 1 at/after today. Degenerate spans (buy_date >= today) collapse to 1.
export function rampFraction(buyDate: string, date: string, todayStr: string): number {
  const t0 = parseDay(buyDate);
  const t1 = parseDay(todayStr);
  const t = parseDay(date);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || !Number.isFinite(t)) return 1;
  const span = t1 - t0;
  if (span <= 0) return t >= t0 ? 1 : 0;
  return Math.min(1, Math.max(0, (t - t0) / span));
}

// Estimated value (equity, for property) of the asset on `date`, in the input
// currency. A straight line from buy_price (at buy_date) to currentValue (today);
// 0 before the asset was acquired. For property the mortgage balance is
// subtracted — held flat at its recorded value for past dates, since
// computeCurrentBalance only projects forward; a conservative placeholder the
// server's schedule-accurate reconstruction later refines.
export function estimateValueAt(a: EstimableAsset, date: string, todayStr: string): number {
  if (date < a.buyDate) return 0;
  const frac = rampFraction(a.buyDate, date, todayStr);
  const buyPrice = Number.isFinite(a.buyPrice) && a.buyPrice > 0 ? a.buyPrice : a.currentValue;
  const grossValue = buyPrice + (a.currentValue - buyPrice) * frac;
  if (!a.mortgage || a.mortgage.balance <= 0) return Math.max(0, grossValue);
  const balance = computeCurrentBalance(
    {
      type: "real_estate",
      mortgage_balance: a.mortgage.balance,
      mortgage_balance_recorded_at: a.mortgage.recordedAt ?? null,
      mortgage_rate: a.mortgage.rate ?? null,
      monthly_payment: a.mortgage.monthlyPayment ?? null,
      mortgage_type: a.mortgage.type ?? null,
    },
    new Date(date + "T12:00:00Z"),
  );
  return Math.max(0, grossValue - balance);
}

export interface SimplePoint {
  date: string; // YYYY-MM-DD
  total: number; // net-worth total on that date, one currency
}

// One un-historized asset to ramp into the graph. `excess` is how much of that
// asset's value is NOT yet reflected in the real history (its current
// contribution minus whatever the latest snapshot already carries for it), so
// re-adding a partially-historized asset can't double-count. The ramp SHAPE
// comes from the asset's own buy→today curve; `excess` scales it so the ramp
// lands exactly on the live value at today.
export interface PendingRamp {
  asset: EstimableAsset;
  excess: number;
}

// First-of-month dates from `start` up to (but excluding) `before`, ascending.
function monthlyGrid(start: string, before: string): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00Z");
  d.setUTCDate(1);
  const end = new Date(before + "T00:00:00Z");
  while (d < end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

// Build a provisional net-worth series (one currency) by folding the pending
// assets' estimated value into the real history. `realPoints` are the existing
// snapshot totals in the SAME currency, ascending by date, EXCLUDING today's
// live tip. Returns points ascending by date; the caller appends today's live
// value (which already equals real + full excess, so the ramp lands on it with
// no spike).
//
// Each pending asset contributes `excess × (estimateValueAt(date) /
// estimateValueAt(today))` — its own curve shape, scaled so today's addition is
// exactly `excess`. A zero-valued-today asset contributes nothing.
//
// Two modes, chosen by whether there's real history to lean on:
//   • Has history → LIFT each existing point by the ramp. This is honest: the
//     asset genuinely existed then, so net worth really was higher. It removes
//     the spike within the tracked window without fabricating any market past.
//     The deep pre-history extension is left to the server reconstruction, which
//     extends the axis (with real market + CBS shape) when it lands — trying to
//     synthesize it here only manufactures a cliff where the market base begins.
//   • No history (the added asset is the account's first past-dated holding) →
//     synthesize monthly points back to its buy date (clamped to the 30-year
//     floor). There's no market base here, so no cliff to create.
export function buildProvisionalTotals(
  realPoints: SimplePoint[],
  pending: PendingRamp[],
  todayStr: string,
): SimplePoint[] {
  const live = pending.filter((p) => p.excess > 0 && estimateValueAt(p.asset, todayStr, todayStr) > 0);
  if (live.length === 0) return realPoints.slice();

  const added = (date: string): number => {
    let sum = 0;
    for (const { asset, excess } of live) {
      const todayVal = estimateValueAt(asset, todayStr, todayStr);
      if (todayVal <= 0) continue;
      sum += excess * (estimateValueAt(asset, date, todayStr) / todayVal);
    }
    return sum;
  };

  if (realPoints.length > 0) {
    return realPoints.map((p) => ({ date: p.date, total: p.total + added(p.date) }));
  }

  const earliestBuy = live.reduce((m, p) => (p.asset.buyDate < m ? p.asset.buyDate : m), live[0].asset.buyDate);
  const clampedStart = clampHistoryStart(earliestBuy, todayStr);
  return monthlyGrid(clampedStart, todayStr).map((d) => ({ date: d, total: added(d) }));
}

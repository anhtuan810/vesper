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

// One historical point for reconciliation: its stored net-worth total AND its
// per-asset-type split, BOTH in the same (display) currency. `byType` keys are
// asset types (real_estate, stocks, etf, crypto, cash, …), same as a snapshot's
// breakdown.
export interface ReconcilePoint {
  date: string;
  total: number;
  byType: Record<string, number>;
}

// A holding that was removed (or reduced) since the stored history was built but
// is still baked into it. `fraction` is how much of that type's stored value to
// strip at each point (1 = fully removed, 0.5 = halved).
export interface Removal {
  type: string;
  fraction: number;
}

// Reconcile stored history to the CURRENT set of holdings while the authoritative
// server reconstruction is still in flight.
//
// This is the structural fix for a whole family of transient artifacts. Any
// holdings change (add, remove, mistake-delete, quantity edit) leaves the stored
// snapshots describing the OLD book while today's live tip describes the NEW one;
// drawing the raw join between them produces a spike (on add) or a cliff (on
// remove) at today, until backfillSnapshots rewrites the history. Rather than
// patch each direction separately, reconcile the displayed line to what the user
// holds NOW — which is exactly what the reconstruction will produce, so the later
// swap is seamless:
//   • ADDITIONS (a back-dated asset not yet in history) are RAMPED up from their
//     buy date — `excess × estimateValueAt(date)/estimateValueAt(today)`, the
//     asset's own curve scaled to land on the live value at today.
//   • REMOVALS/REDUCTIONS (a holding still in history) SUBTRACT that type's own
//     stored trajectory (`byType[type] × fraction`) — so it fades out of the past
//     exactly as it will once the rebuild lands, with no cliff at today.
// `points` are ascending, display currency, EXCLUDING today's live tip (the
// caller appends that, and it already reflects the current book).
export function reconcileHistoryToHoldings(
  points: ReconcilePoint[],
  additions: PendingRamp[],
  removals: Removal[],
  todayStr: string,
): SimplePoint[] {
  const live = additions.filter((r) => r.excess > 0 && estimateValueAt(r.asset, todayStr, todayStr) > 0);
  const rampAdd = (date: string): number => {
    let sum = 0;
    for (const r of live) {
      const todayVal = estimateValueAt(r.asset, todayStr, todayStr);
      if (todayVal > 0) sum += r.excess * (estimateValueAt(r.asset, date, todayStr) / todayVal);
    }
    return sum;
  };
  return points.map((p) => {
    let sub = 0;
    for (const r of removals) sub += r.fraction * (p.byType[r.type] ?? 0);
    return { date: p.date, total: Math.max(0, p.total + rampAdd(p.date) - sub) };
  });
}

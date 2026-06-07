// Deterministic future-projection engine, layered on the present-tense scenario
// engine. Pure functions only — FX rates are passed in; no I/O, no model produces
// any number. Three modes: trajectory, shock, solve-for.
//
// Reuses computeReadout / ScenarioAsset / categoryForType from ./engine and the
// mortgage helper (transitively, via computeReadout) so projected numbers match
// the live Vitals/Portfolio definitions. All amounts are on the USD bridge.

import {
  computeReadout,
  categoryForType,
  type ScenarioAsset,
  type UsdRates,
  type Readout,
} from "./engine";

// ── Shared ──────────────────────────────────────────────────────────────────

export type Frequency = "monthly" | "quarterly" | "annual";
const PERIODS_PER_YEAR: Record<Frequency, number> = { monthly: 12, quarterly: 4, annual: 1 };

export interface Contribution {
  amount: number; // per period, USD
  frequency: Frequency;
}

const fmtRate = (r: number) => `${(r * 100).toFixed(1)}%`;

// ── 1. Growth rate derived from the user's own snapshot history ────────────────

export interface DerivedGrowthRate {
  rate: number; // annualized, nominal
  basis: string;
  clamped: boolean;
  assumptions: string[];
}

export interface GrowthRateOpts {
  minWindowDays?: number;
  defaultRate?: number;
  clampRate?: number;
  minBaseUsd?: number;
  asOf?: Date;
}

const MIN_WINDOW_DAYS = 90;
const DEFAULT_RATE = 0.05; // conservative nominal default when history is thin
const RATE_CLAMP = 0.3; // cap implausible extrapolation at ±30%/yr
const MIN_BASE_USD = 1000; // below this the ratio explodes — fall back to default

/**
 * Realized annualized (nominal) return over the available snapshot window.
 * Guards: requires >= minWindowDays of history and a non-tiny starting base,
 * else returns a labelled conservative default; clamps extreme rates.
 * snapshots: { date: "YYYY-MM-DD", total_value: USD net worth } (writeSnapshot shape).
 */
export function deriveGrowthRate(
  snapshots: Array<{ date: string; total_value: number }>,
  opts: GrowthRateOpts = {},
): DerivedGrowthRate {
  const minWindow = opts.minWindowDays ?? MIN_WINDOW_DAYS;
  const def = opts.defaultRate ?? DEFAULT_RATE;
  const clampAt = opts.clampRate ?? RATE_CLAMP;
  const minBase = opts.minBaseUsd ?? MIN_BASE_USD;

  const pts = [...snapshots]
    .filter((s) => Number.isFinite(s.total_value))
    .sort((a, b) => a.date.localeCompare(b.date));

  const fallback = (why: string): DerivedGrowthRate => {
    const basis = `default ${fmtRate(def)} nominal (${why})`;
    return {
      rate: def,
      basis,
      clamped: false,
      assumptions: [`Growth rate: ${fmtRate(def)} — ${basis}.`, "Nominal (not inflation-adjusted)."],
    };
  };

  if (pts.length < 2) return fallback("insufficient history: fewer than 2 snapshots");

  const first = pts[0];
  const last = pts[pts.length - 1];
  const days = (Date.parse(last.date) - Date.parse(first.date)) / 86_400_000;
  if (days < minWindow) return fallback(`insufficient history: ${Math.round(days)}d < ${minWindow}d window`);
  if (first.total_value < minBase || first.total_value <= 0) {
    return fallback(`starting base below ${minBase} — extrapolation unreliable`);
  }

  let rate = Math.pow(last.total_value / first.total_value, 365 / days) - 1;
  let clamped = false;
  if (rate > clampAt) { rate = clampAt; clamped = true; }
  if (rate < -clampAt) { rate = -clampAt; clamped = true; }

  const basis =
    `realized annualized nominal return over ${Math.round(days)} days (${pts.length} snapshots)` +
    (clamped ? `, clamped to ±${fmtRate(clampAt)}` : "");
  return {
    rate,
    basis,
    clamped,
    assumptions: [
      `Growth rate: ${fmtRate(rate)} — ${basis}.`,
      "Nominal (not inflation-adjusted).",
    ],
  };
}

// ── 1b. Assumed growth rate — explicit constant, never fit from history ────────
//
// Trajectory projections must not imply we've measured the user's returns from
// a few weeks of snapshots. Instead we drive them off a labelled assumption.

export const ASSUMED_ANNUAL_REAL_RETURN = 0.05;

export function assumedGrowthRate(rate: number = ASSUMED_ANNUAL_REAL_RETURN): DerivedGrowthRate {
  const basis = `assumed ~${fmtRate(rate)}/yr long-run real return — not derived from your history`;
  return {
    rate,
    basis,
    clamped: false,
    assumptions: [
      `Growth rate: assuming ~${fmtRate(rate)}/yr — ${basis}.`,
      "Real (inflation-adjusted) assumption, not a measurement of your portfolio.",
    ],
  };
}

// ── 2. Trajectory projection (returned as a band) ──────────────────────────────

export interface Trajectory {
  low: number;
  mid: number;
  high: number;
  assumptions: string[];
}

// Band method: low/high re-run the same future-value formula at the derived
// annual rate ∓ a fixed spread, conveying uncertainty as a simple, conservative
// envelope rather than a false-precision point estimate.
const BAND_SPREAD = 0.03; // ±3 percentage points on the annual rate

function futureValue(
  startUsd: number,
  annualRate: number,
  contribution: Contribution | null,
  horizonYears: number,
): number {
  const ppy = contribution ? PERIODS_PER_YEAR[contribution.frequency] : 12;
  const n = Math.max(0, Math.round(horizonYears * ppy));
  if (n === 0) return startUsd;
  const pr = Math.pow(1 + annualRate, 1 / ppy) - 1; // effective per-period rate
  const growth = Math.pow(1 + pr, n);
  const fvStart = startUsd * growth;
  const amt = contribution?.amount ?? 0;
  // Ordinary annuity future value (contribution at period end).
  const fvContrib = amt === 0 ? 0 : pr === 0 ? amt * n : amt * ((growth - 1) / pr);
  return fvStart + fvContrib;
}

export function projectTrajectory(
  startUsd: number,
  rate: number,
  contribution: Contribution | null,
  horizonYears: number,
): Trajectory {
  const mid = futureValue(startUsd, rate, contribution, horizonYears);
  const low = futureValue(startUsd, rate - BAND_SPREAD, contribution, horizonYears);
  const high = futureValue(startUsd, rate + BAND_SPREAD, contribution, horizonYears);

  const contribNote = contribution && contribution.amount > 0
    ? `Contribution: ${contribution.amount} USD ${contribution.frequency}.`
    : "No periodic contribution.";
  return {
    low,
    mid,
    high,
    assumptions: [
      `Horizon: ${horizonYears} year(s).`,
      contribNote,
      `Band: mid at the derived rate (${fmtRate(rate)}); low/high at ±${fmtRate(BAND_SPREAD)} on the annual rate.`,
    ],
  };
}

// ── 3. Shock (transform asset/category × factor, recompute readouts) ───────────

export interface ShockEntry {
  scope: "category" | "type" | "asset";
  key: string;
  factor: number;
}

// "housing" is a friendly alias for the property category.
const SHOCK_CATEGORY_ALIAS: Record<string, string> = { housing: "property" };

function shockFactorFor(asset: ScenarioAsset, spec: ShockEntry[]): number {
  const cat = categoryForType(asset.type);
  let factor = 1;
  for (const s of spec) {
    let hit = false;
    if (s.scope === "asset") hit = s.key === asset.id;
    else if (s.scope === "type") hit = s.key === asset.type;
    else hit = (SHOCK_CATEGORY_ALIAS[s.key] ?? s.key) === cat;
    if (hit) factor *= s.factor;
  }
  return factor;
}

/**
 * Apply the shock to GROSS asset values (a pure copy). Crucially, a housing
 * shock multiplies the property's gross value; the mortgage is left fixed, so
 * equity is recomputed downstream by computeReadout via the mortgage helper —
 * never a flat haircut on equity.
 */
export function applyShockAssets(assets: ScenarioAsset[], spec: ShockEntry[]): ScenarioAsset[] {
  return assets.map((a) => {
    const f = shockFactorFor(a, spec);
    return f === 1 ? { ...a } : { ...a, value: a.value * f };
  });
}

export function applyShock(
  assets: ScenarioAsset[],
  spec: ShockEntry[],
  usdRates: UsdRates,
  asOf: Date = new Date(),
): { readout: Readout; assumptions: string[] } {
  const shocked = applyShockAssets(assets, spec);
  const readout = computeReadout(shocked, usdRates, asOf);
  const assumptions = spec.map(
    (s) => `Shock: ${s.scope} "${s.key}" × ${s.factor} (gross value; mortgages held fixed).`,
  );
  return { readout, assumptions };
}

// ── 4. Solve-for required periodic contribution ────────────────────────────────

export interface SolveResult {
  amountPerPeriod: number;
  frequency: Frequency;
  horizonYears: number;
  rate: number;
  assumptions: string[];
}

/**
 * Closed-form annuity solve for the contribution that grows startUsd to targetUsd
 * over horizonYears at `rate`. If growth alone already reaches the target, returns 0.
 */
export function solveContribution(
  startUsd: number,
  targetUsd: number,
  horizonYears: number,
  rate: number,
  frequency: Frequency = "monthly",
): SolveResult {
  const ppy = PERIODS_PER_YEAR[frequency];
  const n = Math.max(0, Math.round(horizonYears * ppy));
  const pr = Math.pow(1 + rate, 1 / ppy) - 1;

  let amount: number;
  if (n === 0) {
    amount = Math.max(0, targetUsd - startUsd);
  } else {
    const growth = Math.pow(1 + pr, n);
    const fvStart = startUsd * growth;
    if (targetUsd <= fvStart) amount = 0;
    else if (pr === 0) amount = (targetUsd - fvStart) / n;
    else amount = (targetUsd - fvStart) / ((growth - 1) / pr);
    amount = Math.max(0, amount);
  }

  return {
    amountPerPeriod: amount,
    frequency,
    horizonYears,
    rate,
    assumptions: [
      `Target: ${targetUsd} USD in ${horizonYears} year(s).`,
      `Required contribution: ${amount.toFixed(2)} USD ${frequency} at ${fmtRate(rate)} nominal.`,
      amount === 0 ? "Projected growth alone reaches the target — no contribution required." : "Ordinary annuity (contribution at period end).",
    ],
  };
}

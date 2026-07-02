// ── Vital letter grades ───────────────────────────────────────────────────────
// One letter per vital (A/B/C/D) so a reader who can't yet interpret "67,5%
// LTV" still sees instantly how good or bad it is. DERIVED, never independent:
// amber is always C and red is always D (the grade can never contradict the
// band's status word), and the only refinement is INSIDE green — A when
// comfortably in range, B when green but approaching the amber threshold. The
// B cut-offs below are anchored to the same thresholds the band functions in
// src/lib/vitals/*.ts use (concentration ≤35 green / >50 red, leverage ≤50 /
// >75, drawdown ≤25 / >40, cashRealYield ≥0 / <−2, realGrowth ≥0 / <−2,
// realAssetWeight 10–75 green). Pure and client-safe; covered by
// scripts/verify-vital-grade.ts.

import type { ConcentrationValue } from "./concentration";
import type { RealAssetWeightValue } from "./realAssetWeight";
import type { LiquidityPostureValue } from "./liquidityPosture";
import type { LeverageValue } from "./leverage";
import type { DrawdownValue } from "./drawdown";
import type { CashRealYieldValue } from "./cashRealYield";
import type { RealGrowthValue } from "./realGrowth";

export type VitalGrade = { letter: "A" | "B" | "C" | "D"; tone: "good" | "warn" | "bad" };

const GOOD = (letter: "A" | "B"): VitalGrade => ({ letter, tone: "good" });
const C: VitalGrade = { letter: "C", tone: "warn" };
const D: VitalGrade = { letter: "D", tone: "bad" };

export function vitalGrade(key: string, band: string, value: unknown): VitalGrade | null {
  if (value == null) return null;

  // Concentration self-derives from the same pct the band function uses
  // (investable basis when present), so the grade agrees with the band in
  // BOTH property lenses without duplicating the lens override.
  if (key === "concentration") {
    const v = value as ConcentrationValue;
    const pct = v.investableTopPositionPct ?? v.topPositionPct;
    if (pct == null) return null;
    if (pct > 50) return D;
    if (pct > 35) return C;
    return pct > 28 ? GOOD("B") : GOOD("A");
  }

  // Every other vital: amber → C, red → D, uniformly.
  if (band === "red") return D;
  if (band === "amber") return C;
  if (band !== "green") return null;

  // Green refinements: B when in range but approaching the amber threshold.
  switch (key) {
    case "realAssetWeight": {
      const v = value as RealAssetWeightValue;
      // Green is 10–75; B when within ~10 points of either edge.
      return v.propertyEquityPct >= 65 || v.propertyEquityPct <= 20 ? GOOD("B") : GOOD("A");
    }
    case "liquidityPosture": {
      const v = value as LiquidityPostureValue;
      if (v.insufficient) return null; // nothing to assess — the row shows "—"
      // Green is ≥ buffer; A when there's real headroom (1.5× the target).
      return v.deployable1wPct >= v.liquidBufferPct * 1.5 ? GOOD("A") : GOOD("B");
    }
    case "leverage": {
      const v = value as LeverageValue;
      // Green is ≤50; B in the last 10 points before amber.
      return v.ltvPct > 40 ? GOOD("B") : GOOD("A");
    }
    case "drawdown": {
      const v = value as DrawdownValue;
      // Green is ≤25; B in the last stretch before amber.
      return v.shockPctOfNw > 18 ? GOOD("B") : GOOD("A");
    }
    case "cashRealYield": {
      const v = value as CashRealYieldValue;
      // Green is ≥0; A only with a genuinely positive real yield.
      return v.realYieldPct >= 0.5 ? GOOD("A") : GOOD("B");
    }
    case "realGrowth": {
      const v = value as RealGrowthValue;
      // Green is ≥0; A when clearly ahead of inflation.
      return v.real12moPct >= 2 ? GOOD("A") : GOOD("B");
    }
    default:
      return GOOD("A");
  }
}

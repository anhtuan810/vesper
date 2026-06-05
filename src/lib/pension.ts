import type { Asset } from "@/lib/supabase";

// Pensions are one asset class (type='pension') with two economic shapes:
//  - CAPITAL: a pot you own with a present value (pension_kind='dc', or null for
//    legacy rows). Counts toward net worth; has a pot projection.
//  - INCOME: a future income entitlement, no owned balance (pension_kind 'db' or
//    'state'). Never counts toward net worth, liquidity, concentration, or drawdown.
// pension_kind is treated as 'dc' (capital) defensively when null/undefined.

export type PensionShape = "capital" | "income";

export function pensionShape(a: Asset): PensionShape {
  if (a.type === "pension" && (a.pension_kind === "db" || a.pension_kind === "state")) {
    return "income";
  }
  return "capital";
}

export function isIncomePension(a: Asset): boolean {
  return a.type === "pension" && pensionShape(a) === "income";
}

export function isCapitalPension(a: Asset): boolean {
  return a.type === "pension" && pensionShape(a) === "capital";
}

export interface PensionProjection {
  projected: number;
  contributed: number;
  growth: number;
}

// Deterministic future-value projection for a capital (DC) pension pot.
// All outputs are integers (Math.round) in the pot's native units — no floats
// reach callers, and i=0 / yearsToAccess<=0 never produce NaN or Infinity.
export function projectPension(args: {
  potValue: number;
  monthlyContribution: number;
  growthRatePct: number;
  yearsToAccess: number;
}): PensionProjection {
  const { potValue, monthlyContribution, growthRatePct, yearsToAccess } = args;

  if (yearsToAccess <= 0) {
    return { projected: Math.round(potValue), contributed: Math.round(potValue), growth: 0 };
  }

  const r = growthRatePct / 100; // annual rate
  const i = r / 12; // monthly rate
  const m = Math.round(yearsToAccess * 12); // number of monthly contributions

  const fvPot = potValue * Math.pow(1 + r, yearsToAccess);
  const fvContrib =
    i > 0
      ? monthlyContribution * ((Math.pow(1 + i, m) - 1) / i)
      : monthlyContribution * m;

  const projected = Math.round(fvPot + fvContrib);
  const contributed = Math.round(potValue + monthlyContribution * m);
  const growth = Math.round(projected - contributed);

  return { projected, contributed, growth };
}

// Years from the user's current age until they can access the pension.
// null when either age is missing; never negative.
export function yearsToAccess(
  accessAge: number | null | undefined,
  currentAge: number | null | undefined,
): number | null {
  if (accessAge == null || currentAge == null) return null;
  return Math.max(0, accessAge - currentAge);
}

export const PENSION_PROJECTION_DISCLAIMER =
  "An estimate of future value based on your inputs. Not financial advice.";

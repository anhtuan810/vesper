// Pure core of the future-projection assembly (no I/O) — testable with fixtures.
import { computeReadout, compareScenarios, type ScenarioAsset, type UsdRates, type Comparison } from "@/lib/scenario/engine";
import {
  deriveGrowthRate,
  projectTrajectory,
  solveContribution,
  applyShockAssets,
  type Contribution,
  type Frequency,
  type ShockEntry,
  type Trajectory,
  type SolveResult,
} from "@/lib/scenario/projection";

const FREQUENCIES = new Set<Frequency>(["monthly", "quarterly", "annual"]);
const MS_PER_YEAR = 365.25 * 86_400_000;

function asFrequency(v: unknown): Frequency {
  return typeof v === "string" && FREQUENCIES.has(v as Frequency) ? (v as Frequency) : "monthly";
}
function asContribution(v: unknown): Contribution | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.amount !== "number" || !Number.isFinite(o.amount)) return null;
  return { amount: Math.max(0, o.amount), frequency: asFrequency(o.frequency) };
}
function asShockSpec(v: unknown): ShockEntry[] {
  if (!Array.isArray(v)) return [];
  const out: ShockEntry[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    if (
      (o.scope === "category" || o.scope === "type" || o.scope === "asset") &&
      typeof o.key === "string" &&
      typeof o.factor === "number" &&
      Number.isFinite(o.factor) &&
      o.factor >= 0
    ) {
      out.push({ scope: o.scope, key: o.key, factor: o.factor });
    }
  }
  return out;
}

export interface ProjectInputs {
  assets: ScenarioAsset[];
  snapshots: Array<{ date: string; total_value: number }>;
  usdRates: UsdRates;
  now: Date;
}

export type ProjectResult =
  | { mode: "trajectory"; startUsd: number; rate: number; horizonYears: number; trajectory: Trajectory; assumptions: string[] }
  | { mode: "shock"; comparison: Comparison; assumptions: string[] }
  | { mode: "solve"; startUsd: number; targetUsd: number; date: string; prefilledFromGoal: boolean; rate: number; solve: SolveResult; assumptions: string[] }
  | { error: string };

/** Pure projection. `goal` is the latest goal row (or null) for solve-for prefill. */
export function computeProjection(
  inputs: ProjectInputs,
  body: Record<string, unknown>,
  goal: { target_value?: number | null; target_date?: string | null } | null,
): ProjectResult {
  const { assets, snapshots, usdRates, now } = inputs;
  const mode = body.mode;
  if (mode !== "trajectory" && mode !== "shock" && mode !== "solve") {
    return { error: "mode must be 'trajectory' | 'shock' | 'solve'" };
  }

  const startUsd = computeReadout(assets, usdRates, now).netWorthUsd;
  const growth = deriveGrowthRate(snapshots, { asOf: now });

  if (mode === "trajectory") {
    const contribution = asContribution(body.contribution);
    const horizonYears =
      typeof body.horizonYears === "number" && body.horizonYears > 0
        ? body.horizonYears
        : typeof body.date === "string" && Number.isFinite(Date.parse(body.date))
        ? (Date.parse(body.date) - now.getTime()) / MS_PER_YEAR
        : 10;
    if (horizonYears <= 0) return { error: "horizon must be in the future" };
    const trajectory = projectTrajectory(startUsd, growth.rate, contribution, horizonYears);
    return { mode, startUsd, rate: growth.rate, horizonYears, trajectory, assumptions: [...growth.assumptions, ...trajectory.assumptions] };
  }

  if (mode === "shock") {
    const spec = asShockSpec(body.shock);
    const shockedAssets = applyShockAssets(assets, spec);
    const comparison = compareScenarios(assets, shockedAssets, usdRates, now);
    const assumptions = spec.map((s) => `Shock: ${s.scope} "${s.key}" × ${s.factor} (gross value; mortgages held fixed).`);
    return { mode, comparison, assumptions };
  }

  // solve
  let targetUsd = typeof body.targetUsd === "number" && Number.isFinite(body.targetUsd) ? body.targetUsd : null;
  let dateStr = typeof body.date === "string" ? body.date : null;
  let prefilledFromGoal = false;
  if ((targetUsd === null || dateStr === null) && goal) {
    if (targetUsd === null && typeof goal.target_value === "number") { targetUsd = goal.target_value; prefilledFromGoal = true; }
    if (dateStr === null && typeof goal.target_date === "string") { dateStr = goal.target_date; prefilledFromGoal = true; }
  }
  if (targetUsd === null || dateStr === null || !Number.isFinite(Date.parse(dateStr))) {
    return { error: "solve requires targetUsd + date (or an existing goal to prefill from)" };
  }
  const horizonYears = (Date.parse(dateStr) - now.getTime()) / MS_PER_YEAR;
  if (horizonYears <= 0) return { error: "target date must be in the future" };
  const frequency = asFrequency(body.frequency);
  const solved = solveContribution(startUsd, targetUsd, horizonYears, growth.rate, frequency);
  return { mode, startUsd, targetUsd, date: dateStr, prefilledFromGoal, rate: growth.rate, solve: solved, assumptions: [...growth.assumptions, ...solved.assumptions] };
}

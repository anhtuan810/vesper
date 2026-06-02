import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { getUsdRates } from "@/lib/fx";
import { computeReadout, compareScenarios, type ScenarioAsset } from "@/lib/scenario/engine";
import {
  deriveGrowthRate,
  projectTrajectory,
  solveContribution,
  applyShockAssets,
  type Contribution,
  type Frequency,
  type ShockEntry,
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

// POST /api/scenarios/project
// Deterministic future projection. Resolves the user from the session, reads
// snapshots (for the derived rate), current assets (for shock / start value), and
// optionally the latest goal (solve-for prefill). Read-only — writes nothing.
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const mode = body.mode;
  if (mode !== "trajectory" && mode !== "shock" && mode !== "solve") {
    return NextResponse.json({ error: "mode must be 'trajectory' | 'shock' | 'solve'" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const now = new Date();

  const [{ data: assetRows }, { data: snapRows }] = await Promise.all([
    supabase
      .from("assets")
      .select(
        "id, name, type, value, currency, mortgage_balance, mortgage_balance_recorded_at, mortgage_rate, monthly_payment, mortgage_type",
      )
      .eq("user_id", user.id),
    supabase
      .from("snapshots")
      .select("date, total_value")
      .eq("user_id", user.id)
      .order("date", { ascending: true }),
  ]);

  const assets = (assetRows ?? []) as ScenarioAsset[];
  const snapshots = (snapRows ?? []) as Array<{ date: string; total_value: number }>;
  const usdRates = await getUsdRates();

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
    if (horizonYears <= 0) {
      return NextResponse.json({ error: "horizon must be in the future" }, { status: 400 });
    }
    const trajectory = projectTrajectory(startUsd, growth.rate, contribution, horizonYears);
    return NextResponse.json({
      mode,
      startUsd,
      rate: growth.rate,
      horizonYears,
      trajectory,
      assumptions: [...growth.assumptions, ...trajectory.assumptions],
    });
  }

  if (mode === "shock") {
    const spec = asShockSpec(body.shock);
    const shockedAssets = applyShockAssets(assets, spec);
    const comparison = compareScenarios(assets, shockedAssets, usdRates, now);
    const assumptions = spec.map(
      (s) => `Shock: ${s.scope} "${s.key}" × ${s.factor} (gross value; mortgages held fixed).`,
    );
    return NextResponse.json({ mode, comparison, assumptions });
  }

  // mode === "solve"
  let targetUsd = typeof body.targetUsd === "number" && Number.isFinite(body.targetUsd) ? body.targetUsd : null;
  let dateStr = typeof body.date === "string" ? body.date : null;
  let prefilledFromGoal = false;

  if (targetUsd === null || dateStr === null) {
    // Read the latest goal (best-effort; goals are written elsewhere, read here).
    const { data: goal } = await supabase
      .from("goals")
      .select("target_value, target_date, title")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (goal) {
      if (targetUsd === null && typeof goal.target_value === "number") {
        targetUsd = goal.target_value;
        prefilledFromGoal = true;
      }
      if (dateStr === null && typeof goal.target_date === "string") {
        dateStr = goal.target_date;
        prefilledFromGoal = true;
      }
    }
  }

  if (targetUsd === null || dateStr === null || !Number.isFinite(Date.parse(dateStr))) {
    return NextResponse.json(
      { error: "solve requires targetUsd + date (or an existing goal to prefill from)" },
      { status: 400 },
    );
  }

  const horizonYears = (Date.parse(dateStr) - now.getTime()) / MS_PER_YEAR;
  if (horizonYears <= 0) {
    return NextResponse.json({ error: "target date must be in the future" }, { status: 400 });
  }

  const frequency = asFrequency(body.frequency);
  const solved = solveContribution(startUsd, targetUsd, horizonYears, growth.rate, frequency);
  return NextResponse.json({
    mode,
    startUsd,
    targetUsd,
    date: dateStr,
    prefilledFromGoal,
    rate: growth.rate,
    solve: solved,
    assumptions: [...growth.assumptions, ...solved.assumptions],
  });
}

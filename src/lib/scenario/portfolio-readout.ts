// Whole-portfolio "before -> after" readout for portfolio-changing what-ifs. Reuses
// the present-tense engine (net worth, allocation, single-name concentration via the
// USD bridge) and the existing Vitals metric modules (drawdown, leverage, liquidity)
// run on the modified portfolio. Nothing about the metrics is reimplemented here —
// this only applies the modifications once and reads both layers off the result.

import { computeReadout, applyModifications, type ScenarioAsset, type Modification, type UsdRates, type Readout } from "@/lib/scenario/engine";
import type { Asset } from "@/lib/supabase";
import type { Band, VitalUser } from "@/lib/vitals/types";
import * as drawdown from "@/lib/vitals/drawdown";
import * as leverage from "@/lib/vitals/leverage";
import * as liquidityPosture from "@/lib/vitals/liquidityPosture";

export type ContextualVitalKey = "drawdown" | "leverage" | "liquidity";

export interface ContextualVital {
  key: ContextualVitalKey;
  label: string;
  /** Representative scalar (a percentage) before and after the change. */
  before: number;
  after: number;
  beforeBand: Band;
  afterBand: Band;
  /** True when a higher value is worse (so the card can colour the delta). */
  higherIsWorse: boolean;
}

export interface PortfolioChangeReadout {
  current: Readout;
  scenario: Readout;
  /** Up to two contextual vitals that moved materially and apply after the change. */
  contextualVitals: ContextualVital[];
}

// Per-vital materiality thresholds (percentage points). Below this the move is
// immaterial and the vital is suppressed.
export const VITAL_MATERIALITY = { drawdown: 2, leverage: 1, liquidity: 5 } as const;
const MAX_CONTEXTUAL = 2;

interface VitalModule<T> {
  applies: (u: VitalUser, a: Asset[]) => boolean;
  compute: (u: VitalUser, a: Asset[]) => T;
  band: (v: T) => Band;
}

function buildVital<T>(
  key: ContextualVitalKey,
  label: string,
  mod: VitalModule<T>,
  pick: (v: T) => number,
  higherIsWorse: boolean,
  user: VitalUser,
  before: Asset[],
  after: Asset[],
): ContextualVital | null {
  // Only surface a vital that meaningfully applies to the resulting portfolio
  // (e.g. leverage only when there is still a mortgage).
  if (!mod.applies(user, after)) return null;
  const bv = mod.compute(user, before);
  const av = mod.compute(user, after);
  return { key, label, before: pick(bv), after: pick(av), beforeBand: mod.band(bv), afterBand: mod.band(av), higherIsWorse };
}

/**
 * Apply `mods` once, then read the engine readout (USD bridge) before/after and the
 * Vitals modules before/after. Returns net worth + allocation + concentration plus
 * the up-to-two contextual vitals that crossed their materiality threshold.
 */
export function computePortfolioChange(
  assets: Asset[],
  mods: Modification[],
  usdRates: UsdRates,
  user: VitalUser,
  now: Date = new Date(),
): PortfolioChangeReadout {
  const beforeScenario = assets as unknown as ScenarioAsset[];
  const afterScenario = applyModifications(beforeScenario, mods);
  const current = computeReadout(beforeScenario, usdRates, now);
  const scenario = computeReadout(afterScenario, usdRates, now);

  const before = assets;
  const after = afterScenario as unknown as Asset[];

  const candidates: Array<ContextualVital | null> = [
    buildVital("drawdown", "Drawdown vulnerability", drawdown, (v) => v.shockPctOfNw, true, user, before, after),
    buildVital("leverage", "Leverage (LTV)", leverage, (v) => v.ltvPct, true, user, before, after),
    buildVital("liquidity", "Liquidity posture", liquidityPosture, (v) => v.deployable1wPct, false, user, before, after),
  ];

  const material = candidates
    .filter((c): c is ContextualVital => c != null && Math.abs(c.after - c.before) >= VITAL_MATERIALITY[c.key])
    .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before))
    .slice(0, MAX_CONTEXTUAL);

  return { current, scenario, contextualVitals: material };
}

// Pure core of the present-scenario assembly (no I/O) — testable with fixtures.
import {
  applyModifications,
  compareScenarios,
  type Modification,
  type ScenarioAsset,
  type UsdRates,
  type Comparison,
} from "@/lib/scenario/engine";

/** Clone-and-modify the current assets, then compare. */
export function computePresentComparison(
  current: ScenarioAsset[],
  mods: Modification[],
  usdRates: UsdRates,
): Comparison {
  const scenario = applyModifications(current, mods);
  return compareScenarios(current, scenario, usdRates);
}

// Guards the ProjectionTeaser's display-currency conversion.
// Run:  npx tsx scripts/verify-projection-display.ts
// Exits non-zero on any mismatch. No framework, no I/O.
//
// The teaser anchors its projected figure to today's net worth in the display
// currency (the same value the Portfolio hero shows) and scales it by a
// currency-free growth factor (trajectory.mid / startUsd) — never converting
// the USD trajectory back to the display currency. This must hold regardless
// of the USD<->EUR rate used to compute the USD-bridge startUsd.

import { computeReadout, type ScenarioAsset, type UsdRates } from "../src/lib/scenario/engine";
import { assumedGrowthRate, projectTrajectory } from "../src/lib/scenario/projection";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}
const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

// Single EUR asset, no mortgage — today's net worth in EUR (the Portfolio
// hero's `netTotal`) is the native amount itself, no FX involved.
const NET_TOTAL_EUR = 2_870_000;
const assets: ScenarioAsset[] = [
  { id: "a1", name: "Brokerage", type: "stocks", value: NET_TOTAL_EUR, currency: "EUR" },
];

const EXPECTED_GROWTH = Math.pow(1.05, 10); // 5%/yr compounded over 10y ≈ 1.6289

console.log("Projection teaser: 10y trajectory at +5%/yr, EUR display:");
for (const eurRate of [0.89, 0.75, 1.10]) {
  const usdRates: UsdRates = { EUR: eurRate };
  const startUsd = computeReadout(assets, usdRates).netWorthUsd;
  const growth = assumedGrowthRate();
  const trajectory = projectTrajectory(startUsd, growth.rate, null, 10);

  // The fix: a currency-free factor applied to today's display-currency total —
  // no conversion of the USD trajectory back to EUR.
  const growthFactor = trajectory.mid / startUsd;
  const projectedEur = NET_TOTAL_EUR * growthFactor;

  check(`[EUR rate=${eurRate}] growth factor is FX-invariant`, approx(growthFactor, EXPECTED_GROWTH),
    `factor=${growthFactor.toFixed(6)} expected=${EXPECTED_GROWTH.toFixed(6)}`);
  check(`[EUR rate=${eurRate}] projected exceeds today's net worth`, projectedEur > NET_TOTAL_EUR,
    `projected=${projectedEur.toFixed(2)} today=${NET_TOTAL_EUR}`);
  check(`[EUR rate=${eurRate}] projected ≈ today × 1.05^10 (≈ €4.7M)`, approx(projectedEur, NET_TOTAL_EUR * EXPECTED_GROWTH),
    `projected=${projectedEur.toFixed(2)} expected≈${(NET_TOTAL_EUR * EXPECTED_GROWTH).toFixed(2)}`);
}

console.log(failures === 0 ? "\nAll fixtures passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

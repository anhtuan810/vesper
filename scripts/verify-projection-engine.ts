// Runnable verification for the deterministic projection engine.
// Run:  npx tsx scripts/verify-projection-engine.ts
// Exits non-zero on any mismatch. No framework, no I/O, fixed FX rates.

import { compareScenarios, type ScenarioAsset, type UsdRates } from "../src/lib/scenario/engine";
import {
  deriveGrowthRate,
  projectTrajectory,
  applyShockAssets,
  solveContribution,
} from "../src/lib/scenario/projection";

const RATES: UsdRates = { EUR: 0.9 };
const toUsd = (eur: number) => eur / RATES.EUR;
const asOf = new Date("2026-06-02T00:00:00Z");

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}
const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

// ── Fixture 1: trajectory equals the closed-form annuity future value ──────────
console.log("Fixture 1 — trajectory = closed-form annuity FV:");
{
  const start = 100_000;
  const rate = 0.07;
  const amount = 1_000;
  const years = 10;
  // Independent expected value (monthly, ordinary annuity).
  const ppy = 12;
  const n = years * ppy;
  const pr = Math.pow(1 + rate, 1 / ppy) - 1;
  const growth = Math.pow(1 + pr, n);
  const expected = start * growth + amount * ((growth - 1) / pr);

  const t = projectTrajectory(start, rate, { amount, frequency: "monthly" }, years);
  check("mid equals annuity FV", approx(t.mid, expected), `mid=${t.mid.toFixed(2)} expected=${expected.toFixed(2)}`);
  check("low < mid < high", t.low < t.mid && t.mid < t.high, `${t.low.toFixed(0)} < ${t.mid.toFixed(0)} < ${t.high.toFixed(0)}`);
}

// ── Fixture 2: shock — crypto x0.5 and housing x0.85 (equity via mortgage) ─────
console.log("Fixture 2 — shock crypto x0.5 / housing x0.85:");
{
  const assets: ScenarioAsset[] = [
    { id: "c1", name: "BTC", type: "crypto", value: 100_000, currency: "EUR" },
    { id: "h1", name: "Home", type: "real_estate", value: 500_000, currency: "EUR", mortgage_balance: 300_000 },
  ];
  // crypto x0.5 → net worth drops by half the crypto value (50k EUR).
  const cryptoShock = compareScenarios(assets, applyShockAssets(assets, [{ scope: "category", key: "crypto", factor: 0.5 }]), RATES, asOf);
  check("crypto x0.5 drops NW by half crypto value", approx(cryptoShock.deltas.netWorthUsd, -toUsd(50_000)),
    `Δ=${cryptoShock.deltas.netWorthUsd.toFixed(2)} expected=${(-toUsd(50_000)).toFixed(2)}`);

  // housing x0.85 → drops by 15% of GROSS property value (75k EUR), equity recomputed.
  const housingShock = compareScenarios(assets, applyShockAssets(assets, [{ scope: "category", key: "housing", factor: 0.85 }]), RATES, asOf);
  check("housing x0.85 drops NW by 15% of GROSS property", approx(housingShock.deltas.netWorthUsd, -toUsd(75_000)),
    `Δ=${housingShock.deltas.netWorthUsd.toFixed(2)} expected=${(-toUsd(75_000)).toFixed(2)}`);
  check("housing shock is gross-based, not a flat equity haircut", !approx(housingShock.deltas.netWorthUsd, -toUsd(30_000)),
    `flat-equity would be ${(-toUsd(30_000)).toFixed(2)}`);
}

// ── Fixture 3: solve-for round-trip reaches the target ─────────────────────────
console.log("Fixture 3 — solve-for round-trip:");
{
  const start = 100_000;
  const target = 500_000;
  const years = 10;
  const rate = 0.07;
  const solved = solveContribution(start, target, years, rate, "monthly");
  const back = projectTrajectory(start, rate, { amount: solved.amountPerPeriod, frequency: "monthly" }, years);
  check("required contribution reaches target", approx(back.mid, target),
    `contribution=${solved.amountPerPeriod.toFixed(2)}/mo → mid=${back.mid.toFixed(2)} target=${target}`);
}

// ── Bonus: deriveGrowthRate guards ─────────────────────────────────────────────
console.log("Bonus — deriveGrowthRate guards:");
{
  const oneYear = deriveGrowthRate([
    { date: "2025-06-02", total_value: 100_000 },
    { date: "2026-06-02", total_value: 110_000 },
  ], { asOf });
  check("realized ~10% over a 365d window", approx(oneYear.rate, 0.10, 1e-3) && !oneYear.clamped, `rate=${(oneYear.rate * 100).toFixed(2)}%`);

  const thin = deriveGrowthRate([
    { date: "2026-05-20", total_value: 100_000 },
    { date: "2026-06-02", total_value: 130_000 },
  ], { asOf });
  check("window < 90d → conservative default", approx(thin.rate, 0.05) && thin.basis.includes("default"), `rate=${(thin.rate * 100).toFixed(2)}% basis="${thin.basis}"`);

  const tinyBase = deriveGrowthRate([
    { date: "2025-06-02", total_value: 100 },
    { date: "2026-06-02", total_value: 50_000 },
  ], { asOf });
  check("tiny base → default (no explosive extrapolation)", approx(tinyBase.rate, 0.05), `rate=${(tinyBase.rate * 100).toFixed(2)}%`);

  const extreme = deriveGrowthRate([
    { date: "2025-06-02", total_value: 100_000 },
    { date: "2026-06-02", total_value: 400_000 },
  ], { asOf });
  check("extreme rate clamped to +30%", approx(extreme.rate, 0.30) && extreme.clamped, `rate=${(extreme.rate * 100).toFixed(2)}% clamped=${extreme.clamped}`);
}

console.log(failures === 0 ? "\nAll fixtures passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

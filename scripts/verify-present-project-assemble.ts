// Unit tests for the shared present + project assembly cores (pure, no DB/LLM).
// Run:  npx tsx scripts/verify-present-project-assemble.ts
// Asserts the computed figures match the engine.

import type { ScenarioAsset, Modification, UsdRates } from "../src/lib/scenario/engine";
import { computePresentComparison } from "../src/lib/scenario/present-compute";
import { computeProjection } from "../src/lib/scenario/project-compute";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}
const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

const RATES: UsdRates = { EUR: 0.9 };
const toUsd = (eur: number) => eur / RATES.EUR;
const now = new Date("2026-06-02T00:00:00Z");

// ── Present core ───────────────────────────────────────────────────────────────
console.log("Present — sell €40k ASML into €40k VWCE:");
{
  const assets: ScenarioAsset[] = [
    { id: "a1", name: "ASML", type: "stocks", value: 200_000, currency: "EUR" },
    { id: "a2", name: "VUAA", type: "etf", value: 100_000, currency: "EUR" },
    { id: "a3", name: "Savings", type: "cash", value: 50_000, currency: "EUR" },
  ];
  const mods: Modification[] = [
    { kind: "setValue", assetId: "a1", nativeValue: 160_000 }, // sell €40k of ASML
    { kind: "addByValue", name: "VWCE", type: "etf", currency: "EUR", nativeValue: 40_000 },
  ];
  const cmp = computePresentComparison(assets, mods, RATES);
  check("net worth unchanged (€40k moved within markets)", approx(cmp.deltas.netWorthUsd, 0), `Δ=${cmp.deltas.netWorthUsd}`);
  check(
    "single-name concentration drops",
    (cmp.scenario.topSingleNameConcentrationPct ?? 0) < (cmp.current.topSingleNameConcentrationPct ?? 0),
    `${cmp.current.topSingleNameConcentrationPct?.toFixed(1)}% → ${cmp.scenario.topSingleNameConcentrationPct?.toFixed(1)}%`,
  );
}

console.log("Present — pay €50k off the mortgage (from cash):");
{
  const assets: ScenarioAsset[] = [
    { id: "h1", name: "Home", type: "real_estate", value: 500_000, currency: "EUR", mortgage_balance: 300_000 },
    { id: "c1", name: "Savings", type: "cash", value: 80_000, currency: "EUR" },
  ];
  // pay €50k off mortgage (equity +50k) AND reduce cash by €50k → net worth unchanged.
  const mods: Modification[] = [
    { kind: "payDownMortgage", assetId: "h1", amount: 50_000 },
    { kind: "setValue", assetId: "c1", nativeValue: 30_000 },
  ];
  const cmp = computePresentComparison(assets, mods, RATES);
  check("net worth ~unchanged (cash → equity)", approx(cmp.deltas.netWorthUsd, 0, 1e-6), `Δ=${cmp.deltas.netWorthUsd}`);
  const propCur = cmp.current.allocationByCategory.find((x) => x.category === "property")?.valueUsd ?? 0;
  const propScn = cmp.scenario.allocationByCategory.find((x) => x.category === "property")?.valueUsd ?? 0;
  check("property equity rises by €50k", approx(propScn - propCur, toUsd(50_000)), `Δprop=${(propScn - propCur).toFixed(2)} expected ${toUsd(50_000).toFixed(2)}`);
}

// ── Project core ────────────────────────────────────────────────────────────────
console.log("Project — trajectory matches the engine's annuity FV:");
{
  const assets: ScenarioAsset[] = [{ id: "x", name: "ETF", type: "etf", value: 90_000, currency: "EUR" }]; // €90k → $100k
  // 365-day window: 100k → 110k USD ⇒ ~10% derived rate.
  const snapshots = [
    { date: "2025-06-02", total_value: 100_000 },
    { date: "2026-06-02", total_value: 110_000 },
  ];
  const r = computeProjection({ assets, snapshots, usdRates: RATES, now }, { mode: "trajectory", horizonYears: 10, contribution: { amount: 1000, frequency: "monthly" } }, null);
  if (!("mode" in r) || r.mode !== "trajectory") { check("trajectory result", false); }
  else {
    const start = r.startUsd; // 90k EUR / 0.9 = 100k USD
    check("start = live net worth in USD (100k)", approx(start, 100_000), `${start}`);
    check("derived rate ~10%", approx(r.rate, 0.10, 1e-3), `${(r.rate * 100).toFixed(2)}%`);
    const ppy = 12, n = 120, pr = Math.pow(1 + r.rate, 1 / ppy) - 1, growth = Math.pow(1 + pr, n);
    const expected = start * growth + 1000 * ((growth - 1) / pr);
    check("trajectory mid = closed-form annuity FV", approx(r.trajectory.mid, expected), `mid=${r.trajectory.mid.toFixed(2)} expected=${expected.toFixed(2)}`);
  }
}

console.log("Project — solve-for round-trips to the target:");
{
  const assets: ScenarioAsset[] = [{ id: "x", name: "ETF", type: "etf", value: 90_000, currency: "EUR" }];
  const snapshots = [
    { date: "2024-06-02", total_value: 100_000 },
    { date: "2026-06-02", total_value: 100_000 }, // flat → ~0% derived, but clamp/window fine
  ];
  // Solve to reach $500k by 2036-12-31; feed the contribution back via trajectory.
  const r = computeProjection({ assets, snapshots, usdRates: RATES, now }, { mode: "solve", targetUsd: 500_000, date: "2036-12-31", frequency: "monthly" }, null);
  if (!("mode" in r) || r.mode !== "solve") { check("solve result", false); }
  else {
    const back = computeProjection(
      { assets, snapshots, usdRates: RATES, now },
      { mode: "trajectory", date: "2036-12-31", contribution: { amount: r.solve.amountPerPeriod, frequency: "monthly" } },
      null,
    );
    check("required contribution reaches target", "mode" in back && back.mode === "trajectory" && approx(back.trajectory.mid, 500_000), "mode" in back && back.mode === "trajectory" ? `mid=${back.trajectory.mid.toFixed(2)}` : "");
  }
}

console.log(failures === 0 ? "\nAll assembly-core checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

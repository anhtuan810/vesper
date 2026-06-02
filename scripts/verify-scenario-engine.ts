// Runnable verification for the deterministic scenario engine.
// Run with the project's TS tooling:  npx tsx scripts/verify-scenario-engine.ts
// Exits non-zero on any mismatch. No test framework, no I/O, fixed FX rates.

import {
  applyModifications,
  compareScenarios,
  computeReadout,
  type Modification,
  type ScenarioAsset,
  type UsdRates,
} from "../src/lib/scenario/engine";

const EPS = 1e-6;
const asOf = new Date("2026-06-02T00:00:00Z");

// Units of `quote` per 1 USD (same shape as getUsdRates()). EUR fixtures below.
const RATES: UsdRates = { EUR: 0.9, GBP: 0.8 };
const toUsd = (eur: number) => eur / RATES.EUR;

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  const status = cond ? "PASS" : "FAIL";
  if (!cond) failures++;
  console.log(`  [${status}] ${label}${detail ? `  — ${detail}` : ""}`);
}
const approx = (a: number, b: number) => Math.abs(a - b) < EPS;

// Base portfolio (all EUR, no real estate). markets = stocks+etf, reserves = cash.
const base: ScenarioAsset[] = [
  { id: "a1", name: "ASML", type: "stocks", value: 200_000, currency: "EUR" },
  { id: "a2", name: "VUAA", type: "etf", value: 100_000, currency: "EUR" },
  { id: "a3", name: "AAPL", type: "stocks", value: 100_000, currency: "EUR" },
  { id: "a4", name: "Savings", type: "cash", value: 50_000, currency: "EUR" },
];
const baseReadout = computeReadout(base, RATES, asOf);
const cat = (r: ReturnType<typeof computeReadout>, c: string) =>
  r.allocationByCategory.find((x) => x.category === c)?.valueUsd ?? 0;

// ── Fixture 1: trim €80k ASML, add €80k VWCE ───────────────────────────────────
console.log("Fixture 1 — trim €80k ASML, add €80k VWCE:");
{
  const mods: Modification[] = [
    { kind: "setValue", assetId: "a1", nativeValue: 120_000 },
    { kind: "addByValue", name: "VWCE", type: "etf", currency: "EUR", nativeValue: 80_000 },
  ];
  const cmp = compareScenarios(base, mods0(mods, base), RATES, asOf);
  check("net worth unchanged", approx(cmp.deltas.netWorthUsd, 0), `Δ=${cmp.deltas.netWorthUsd}`);
  check(
    "single-name concentration drops",
    (cmp.scenario.topSingleNameConcentrationPct ?? 0) < (cmp.current.topSingleNameConcentrationPct ?? 0),
    `${cmp.current.topSingleNameConcentrationPct?.toFixed(2)}% → ${cmp.scenario.topSingleNameConcentrationPct?.toFixed(2)}%`,
  );
  check(
    "markets category total preserved",
    approx(cat(cmp.current, "markets"), cat(cmp.scenario, "markets")),
    `${cat(cmp.current, "markets").toFixed(2)} = ${cat(cmp.scenario, "markets").toFixed(2)}`,
  );
  check(
    "reserves category total preserved",
    approx(cat(cmp.current, "reserves"), cat(cmp.scenario, "reserves")),
  );
  check("real assets untouched (base unchanged)", base[0].value === 200_000 && base.length === 4);
}

// ── Fixture 2: remove a position ───────────────────────────────────────────────
console.log("Fixture 2 — remove AAPL (€100k):");
{
  const mods: Modification[] = [{ kind: "remove", assetId: "a3" }];
  const cmp = compareScenarios(base, mods0(mods, base), RATES, asOf);
  check(
    "net worth falls by the position value",
    approx(cmp.deltas.netWorthUsd, -toUsd(100_000)),
    `Δ=${cmp.deltas.netWorthUsd.toFixed(2)} expected ${(-toUsd(100_000)).toFixed(2)}`,
  );
  check("scenario has one fewer asset", cmp.scenario.netWorthUsd < cmp.current.netWorthUsd);
}

// ── Fixture 3: addByValue ──────────────────────────────────────────────────────
console.log("Fixture 3 — addByValue €50k crypto:");
{
  const mods: Modification[] = [
    { kind: "addByValue", name: "BTC", type: "crypto", currency: "EUR", nativeValue: 50_000 },
  ];
  const cmp = compareScenarios(base, mods0(mods, base), RATES, asOf);
  check(
    "net worth rises by the added amount",
    approx(cmp.deltas.netWorthUsd, toUsd(50_000)),
    `Δ=${cmp.deltas.netWorthUsd.toFixed(2)} expected ${toUsd(50_000).toFixed(2)}`,
  );
  check(
    "new crypto category appears",
    approx(cat(cmp.scenario, "crypto"), toUsd(50_000)),
  );
}

// Helper: apply mods and assert the engine returned a fresh array (purity guard).
function mods0(mods: Modification[], assets: ScenarioAsset[]): ScenarioAsset[] {
  const out = applyModifications(assets, mods);
  if (out === assets) throw new Error("applyModifications returned the same reference");
  return out;
}

console.log(`\nbase net worth (USD): ${baseReadout.netWorthUsd.toFixed(2)}`);
console.log(failures === 0 ? "\nAll fixtures passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

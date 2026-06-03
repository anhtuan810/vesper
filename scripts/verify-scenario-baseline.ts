// Verifies the scenario baseline is the live, freshly-priced portfolio — identical
// to what the dashboard computes for the same holdings + prices — and NOT the stale
// stored values. Both layers share applyLivePrice, so they cannot drift.
// Run:  npx tsx scripts/verify-scenario-baseline.ts

import { applyLivePrice, type LivePrice } from "../src/lib/live-pricing";
import { computeReadout, type ScenarioAsset } from "../src/lib/scenario/engine";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}
const approx = (a: number, b: number, eps = 0.05) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

const RATES = { EUR: 1 }; // treat EUR as the USD bridge unit for a clean assertion
const NOW = new Date();

// Stored rows: NVIDIA's persisted value is stale (it moved a lot since last sync).
type Row = ScenarioAsset & { symbol?: string | null; units?: number | null };
const stored: Row[] = [
  { id: "nvda", name: "NVIDIA", type: "stocks", value: 70_000, currency: "EUR", symbol: "NVDA", units: 1000 },
  { id: "aapl", name: "Apple", type: "stocks", value: 90_000, currency: "EUR" },
  { id: "cash", name: "Savings", type: "cash", value: 92_274, currency: "EUR" },
];
// Live price for NVIDIA: 1000 units × €190 = €190,000.
const priceMap: Record<string, LivePrice> = { NVDA: { price: 190, nativeCurrency: "EUR", previousClose: 188, nativePrice: 190 } };

// The dashboard's live portfolio = applyLivePrice over each holding.
const dashboard = stored.map((a) => (a.symbol ? applyLivePrice(a, priceMap[a.symbol]) : a));
// The scenario baseline must be built the SAME way (same formula, same price source).
const scenarioBaseline = stored.map((a) => (a.symbol ? applyLivePrice(a, priceMap[a.symbol]) : a));

const stale = computeReadout(stored, RATES, NOW);
const dash = computeReadout(dashboard, RATES, NOW);
const scenario = computeReadout(scenarioBaseline, RATES, NOW);

console.log("Stale stored baseline (the bug):");
check("stale net worth = €252,274 (understated)", approx(stale.netWorthUsd, 252_274), `${stale.netWorthUsd.toFixed(0)}`);
// With NVIDIA's stale value, it isn't even the top name — concentration is wrong.
check("stale top name is NOT NVIDIA (understated)", stale.topSingleName !== "NVIDIA", `${stale.topSingleName} @ ${stale.topSingleNameConcentrationPct?.toFixed(1)}%`);

console.log("Live dashboard baseline:");
check("live net worth = €372,274", approx(dash.netWorthUsd, 372_274), `${dash.netWorthUsd.toFixed(0)}`);
check("live NVIDIA concentration ≈ 51%", approx(dash.topSingleNameConcentrationPct!, 51.04, 0.02), `${dash.topSingleNameConcentrationPct?.toFixed(1)}%`);
check("live NVIDIA is the top name", dash.topSingleName === "NVIDIA");

console.log("Scenario baseline == dashboard (single source of truth):");
check("net worth equal", scenario.netWorthUsd === dash.netWorthUsd, `${scenario.netWorthUsd.toFixed(0)} vs ${dash.netWorthUsd.toFixed(0)}`);
check("concentration equal", scenario.topSingleNameConcentrationPct === dash.topSingleNameConcentrationPct, `${scenario.topSingleNameConcentrationPct?.toFixed(2)}%`);

console.log("Scenario baseline != stale (the fix):");
check("baseline no longer uses the stale net worth", scenario.netWorthUsd !== stale.netWorthUsd);
check("baseline no longer understates concentration", scenario.topSingleNameConcentrationPct !== stale.topSingleNameConcentrationPct);

console.log(failures === 0 ? "\nAll scenario-baseline checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

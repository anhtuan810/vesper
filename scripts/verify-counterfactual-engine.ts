// Runnable verification for the deterministic past-counterfactual engine.
// Run:  npx tsx scripts/verify-counterfactual-engine.ts
// Exits non-zero on any mismatch. Pure functions only — no network.

import {
  reconstructPositionSeries,
  counterfactualRemove,
  contribution,
  type CurvePoint,
  type PricePoint,
  type FxByDate,
} from "../src/lib/scenario/counterfactual";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}
const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

// ── Fixture 1: cf = actual − position; contribution = actual_today − cf_today ──
console.log("Fixture 1 — counterfactual = actual − position; contribution:");
{
  const actual: CurvePoint[] = [
    { date: "2026-01-01", valueUsd: 1000 },
    { date: "2026-02-01", valueUsd: 1200 },
    { date: "2026-03-01", valueUsd: 1500 },
  ];
  const prices: PricePoint[] = [
    { date: "2026-01-01", price: 100, currency: "USD" },
    { date: "2026-02-01", price: 110, currency: "USD" },
    { date: "2026-03-01", price: 120, currency: "USD" },
  ];
  const pos = reconstructPositionSeries(actual.map((p) => p.date), 2, prices, {});
  const cf = counterfactualRemove(actual, pos.series);
  const everyMatch = actual.every((a, i) => approx(cf.series[i].valueUsd, a.valueUsd - pos.series[i].valueUsd));
  check("cf[i] = actual[i] − position[i]", everyMatch);
  check("position today = 2 × 120 = 240", approx(pos.series[2].valueUsd, 240));
  const c = contribution(actual[2].valueUsd, cf.series[2].valueUsd);
  check("contribution = actual_today − cf_today = 240", approx(c.valueUsd, 240), `got ${c.valueUsd}`);
}

// ── Fixture 2: FX applied per date (non-USD position, varying FX) ──────────────
console.log("Fixture 2 — FX applied per date:");
{
  const dates = ["2026-01-01", "2026-02-01"];
  const prices: PricePoint[] = [
    { date: "2026-01-01", price: 100, currency: "EUR" },
    { date: "2026-02-01", price: 100, currency: "EUR" }, // same price both dates
  ];
  const fx: FxByDate = {
    "2026-01-01": { EUR: 0.9 }, // 1 USD = 0.9 EUR
    "2026-02-01": { EUR: 0.8 }, // 1 USD = 0.8 EUR
  };
  const pos = reconstructPositionSeries(dates, 1, prices, fx);
  // 100 EUR / 0.9 = 111.11; 100 EUR / 0.8 = 125 — different despite identical price.
  check("date 1 uses 0.9 → ≈111.11", approx(pos.series[0].valueUsd, 100 / 0.9), `${pos.series[0].valueUsd.toFixed(2)}`);
  check("date 2 uses 0.8 → 125", approx(pos.series[1].valueUsd, 100 / 0.8), `${pos.series[1].valueUsd.toFixed(2)}`);
  check("per-date FX (not a single rate)", !approx(pos.series[0].valueUsd, pos.series[1].valueUsd));
}

// ── Fixture 3: bought mid-window → cf == actual before buy, diverges after ─────
console.log("Fixture 3 — position bought mid-window:");
{
  const actual: CurvePoint[] = [
    { date: "2026-01-01", valueUsd: 1000 },
    { date: "2026-02-01", valueUsd: 1000 },
    { date: "2026-03-01", valueUsd: 1000 },
    { date: "2026-04-01", valueUsd: 1000 },
  ];
  const prices: PricePoint[] = actual.map((a) => ({ date: a.date, price: 100, currency: "USD" }));
  // Bought 5 units on 2026-02-15 (units 0 before).
  const units = [{ date: "2026-02-15", units: 5 }];
  const pos = reconstructPositionSeries(actual.map((p) => p.date), units, prices, {});
  const cf = counterfactualRemove(actual, pos.series);
  check("cf == actual before buy (Jan, Feb)", approx(cf.series[0].valueUsd, 1000) && approx(cf.series[1].valueUsd, 1000));
  check("position 0 before buy", approx(pos.series[0].valueUsd, 0) && approx(pos.series[1].valueUsd, 0));
  check("cf diverges after buy (Mar, Apr)", cf.series[2].valueUsd < 1000 && cf.series[3].valueUsd < 1000,
    `Mar cf=${cf.series[2].valueUsd}, position=${pos.series[2].valueUsd}`);
  check("position = 5 × 100 = 500 after buy", approx(pos.series[2].valueUsd, 500));
}

console.log(failures === 0 ? "\nAll fixtures passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

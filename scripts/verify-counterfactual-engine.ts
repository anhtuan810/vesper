// Runnable verification for the deterministic past-counterfactual engine.
// Run:  npx tsx scripts/verify-counterfactual-engine.ts
// Exits non-zero on any mismatch. Pure functions only — no network.
//
// "Never bought" keeps the deployed capital as cash, so the contribution figure
// is the position's gain/loss versus what was invested (can be negative), not its
// market value.

import {
  reconstructPositionSeries,
  counterfactualRemove,
  contribution,
  type CurvePoint,
  type PricePoint,
  type CashFlow,
  type FxByDate,
} from "../src/lib/scenario/counterfactual";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}
const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

// A flat actual curve over four month-ends (its level is irrelevant to the P&L).
const actual: CurvePoint[] = [
  { date: "2026-01-01", valueUsd: 10_000 },
  { date: "2026-02-01", valueUsd: 10_000 },
  { date: "2026-03-01", valueUsd: 10_000 },
  { date: "2026-04-01", valueUsd: 10_000 },
];
const dates = actual.map((p) => p.date);
const contribOf = (cf: CurvePoint[]) => contribution(actual[actual.length - 1].valueUsd, cf[cf.length - 1].valueUsd).valueUsd;

// ── Fixture 1: buys-only, in profit → contribution = market − invested ────────
console.log("Fixture 1 — buys-only in profit (gain):");
{
  const prices: PricePoint[] = [
    { date: "2026-01-01", price: 100, currency: "USD" },
    { date: "2026-04-01", price: 120, currency: "USD" },
  ];
  const units = [{ date: "2026-01-01", units: 2 }]; // bought 2 @ 100 = 200 cost
  const flows: CashFlow[] = [{ date: "2026-01-01", amount: 200, currency: "USD" }];
  const pos = reconstructPositionSeries(dates, units, prices, {});
  const cf = counterfactualRemove(actual, pos.series, flows, {});
  // market today = 2 × 120 = 240; invested = 200 → gain 40.
  check("position today = 240", approx(pos.series[3].valueUsd, 240));
  check("contribution = market − invested = +40", approx(contribOf(cf.series), 40), `${contribOf(cf.series)}`);
  check("contribution is positive (added)", contribOf(cf.series) > 0);
}

// ── Fixture 2: underwater → contribution NEGATIVE ─────────────────────────────
console.log("Fixture 2 — underwater (cost):");
{
  const prices: PricePoint[] = [
    { date: "2026-01-01", price: 150, currency: "USD" },
    { date: "2026-04-01", price: 100, currency: "USD" },
  ];
  const units = [{ date: "2026-01-01", units: 2 }]; // bought 2 @ 150 = 300 cost
  const flows: CashFlow[] = [{ date: "2026-01-01", amount: 300, currency: "USD" }];
  const pos = reconstructPositionSeries(dates, units, prices, {});
  const cf = counterfactualRemove(actual, pos.series, flows, {});
  // market today = 2 × 100 = 200; invested = 300 → loss −100.
  check("contribution = 200 − 300 = −100", approx(contribOf(cf.series), -100), `${contribOf(cf.series)}`);
  check("contribution is NEGATIVE (cost)", contribOf(cf.series) < 0);
}

// ── Fixture 3: partial sell → contribution = market + proceeds − buys ─────────
console.log("Fixture 3 — partial sell (lifetime P&L):");
{
  const prices: PricePoint[] = [
    { date: "2026-01-01", price: 100, currency: "USD" },
    { date: "2026-02-01", price: 110, currency: "USD" },
    { date: "2026-04-01", price: 120, currency: "USD" },
  ];
  const units = [{ date: "2026-01-01", units: 4 }, { date: "2026-02-01", units: 2 }]; // buy 4, sell 2
  const flows: CashFlow[] = [
    { date: "2026-01-01", amount: 400, currency: "USD" }, // bought 4 @ 100
    { date: "2026-02-01", amount: -220, currency: "USD" }, // sold 2 @ 110
  ];
  const pos = reconstructPositionSeries(dates, units, prices, {});
  const cf = counterfactualRemove(actual, pos.series, flows, {});
  // remaining 2 @ 120 = 240; + proceeds 220 − buys 400 = 60.
  check("position today = 2 × 120 = 240", approx(pos.series[3].valueUsd, 240));
  check("contribution = 240 + 220 − 400 = +60", approx(contribOf(cf.series), 60), `${contribOf(cf.series)}`);
}

// ── Fixture 4: pre-buy-date → cf equals actual (flows and value both zero) ────
console.log("Fixture 4 — pre-buy-date unchanged:");
{
  const prices: PricePoint[] = actual.map((a) => ({ date: a.date, price: 100, currency: "USD" }));
  const units = [{ date: "2026-02-15", units: 5 }];
  const flows: CashFlow[] = [{ date: "2026-02-15", amount: 500, currency: "USD" }];
  const pos = reconstructPositionSeries(dates, units, prices, {});
  const cf = counterfactualRemove(actual, pos.series, flows, {});
  check("cf == actual before buy (Jan, Feb 1)", approx(cf.series[0].valueUsd, 10_000) && approx(cf.series[1].valueUsd, 10_000));
  check("position 0 before buy", approx(pos.series[0].valueUsd, 0) && approx(pos.series[1].valueUsd, 0));
}

// ── Bonus: FX applied per date in the position valuation ───────────────────────
console.log("Bonus — FX applied per date (position valuation):");
{
  const prices: PricePoint[] = [
    { date: "2026-01-01", price: 100, currency: "EUR" },
    { date: "2026-02-01", price: 100, currency: "EUR" },
  ];
  const fx: FxByDate = { "2026-01-01": { EUR: 0.9 }, "2026-02-01": { EUR: 0.8 } };
  const pos = reconstructPositionSeries(["2026-01-01", "2026-02-01"], 1, prices, fx);
  check("100 EUR → 111.11 at 0.9, 125 at 0.8 (per-date FX)", approx(pos.series[0].valueUsd, 100 / 0.9) && approx(pos.series[1].valueUsd, 100 / 0.8));
}

console.log(failures === 0 ? "\nAll fixtures passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

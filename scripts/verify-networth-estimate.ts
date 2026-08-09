// Guards the client-side provisional net-worth estimate (src/lib/networth-estimate.ts).
// Run:  npx tsx scripts/verify-networth-estimate.ts
// Exits non-zero on any mismatch. No framework, no I/O.
//
// The estimate is the instant placeholder shown after a back-dated asset is
// added, before the server's accurate reconstruction lands. It only has to be
// reasonable and spike-free — these checks pin the shape: a smooth ramp from
// buy_price to current value, property net of mortgage, extended back no further
// than the 30-year floor, and landing exactly on the live value at today.

import {
  estimateValueAt,
  rampFraction,
  clampHistoryStart,
  reconcileHistoryToHoldings,
  MAX_HISTORY_YEARS,
  type EstimableAsset,
  type PendingRamp,
  type Removal,
  type ReconcilePoint,
} from "../src/lib/networth-estimate";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

const TODAY = "2026-08-09";

console.log("Ramp fraction:");
check("0 before buy date", rampFraction("2020-01-01", "2019-06-01", TODAY) === 0);
check("1 at today", rampFraction("2020-01-01", TODAY, TODAY) === 1);
check("~half at the midpoint", near(rampFraction("2024-08-09", "2025-08-09", TODAY), 0.5, 0.01),
  String(rampFraction("2024-08-09", "2025-08-09", TODAY)));
check("degenerate (buy today) → 1", rampFraction(TODAY, TODAY, TODAY) === 1);

console.log("\nSingle-asset value estimate (no mortgage — linear ramp):");
const plain: EstimableAsset = { buyDate: "2016-08-09", buyPrice: 100_000, currentValue: 200_000 };
check("equals buy_price at buy date", near(estimateValueAt(plain, "2016-08-09", TODAY), 100_000));
check("equals current value today", near(estimateValueAt(plain, TODAY, TODAY), 200_000));
check("halfway in time ≈ halfway in value", near(estimateValueAt(plain, "2021-08-09", TODAY), 150_000, 500),
  String(estimateValueAt(plain, "2021-08-09", TODAY)));
check("zero before acquisition", estimateValueAt(plain, "2010-01-01", TODAY) === 0);

console.log("\nProperty estimate (equity = value − mortgage):");
// The screenshot house: bought 2014-08 for 185k, now worth 520k, 150k balance.
const house: EstimableAsset = {
  buyDate: "2014-08-01",
  buyPrice: 185_000,
  currentValue: 520_000,
  mortgage: { balance: 150_000, recordedAt: TODAY, rate: 2.05, monthlyPayment: 950, type: "annuity" },
};
const equityToday = estimateValueAt(house, TODAY, TODAY);
check("today's equity ≈ value − balance (520k − 150k)", near(equityToday, 370_000, 2_000), String(equityToday));
const equityMid = estimateValueAt(house, "2020-08-01", TODAY);
check("equity is lower in the past than today", equityMid < equityToday && equityMid > 0, String(equityMid));
check("equity never negative", estimateValueAt(house, "2014-08-01", TODAY) >= 0);
check("zero before purchase", estimateValueAt(house, "2013-01-01", TODAY) === 0);

console.log("\n30-year clamp:");
check(`MAX_HISTORY_YEARS is ${MAX_HISTORY_YEARS}`, MAX_HISTORY_YEARS === 30);
check("a 40-year-old date clamps to 30y before today", clampHistoryStart("1986-01-01", TODAY) === "1996-08-09",
  clampHistoryStart("1986-01-01", TODAY));
check("a recent date is left untouched", clampHistoryStart("2022-03-01", TODAY) === "2022-03-01");

// The screenshot history: ~230–236k of markets, monthly-ish. Once the house is
// added, its equity is also baked into each stored point's real_estate bucket —
// so a REMOVAL test can strip it back out. byType holds the per-type split.
const houseEquityAt = (date: string) => Math.round(estimateValueAt(house, date, TODAY));
const withHouse: ReconcilePoint[] = [
  { date: "2024-08-01", total: 230_000 + houseEquityAt("2024-08-01"), byType: { markets: 230_000, real_estate: houseEquityAt("2024-08-01") } },
  { date: "2025-02-01", total: 234_000 + houseEquityAt("2025-02-01"), byType: { markets: 234_000, real_estate: houseEquityAt("2025-02-01") } },
  { date: "2026-02-01", total: 236_000 + houseEquityAt("2026-02-01"), byType: { markets: 236_000, real_estate: houseEquityAt("2026-02-01") } },
];
const marketsOnly: ReconcilePoint[] = [
  { date: "2024-08-01", total: 230_000, byType: { markets: 230_000 } },
  { date: "2025-02-01", total: 234_000, byType: { markets: 234_000 } },
  { date: "2026-02-01", total: 236_000, byType: { markets: 236_000 } },
];

console.log("\nReconcile — ADD a back-dated house (lift, no spike):");
{
  // History has no house yet; the ramp lifts each point so the line lands on the
  // live total (236k markets + 370k house) with no spike into today.
  const ramps: PendingRamp[] = [{ asset: house, excess: 370_000 }];
  const series = reconcileHistoryToHoldings(marketsOnly, ramps, [], TODAY);
  check("keeps the same points (lifts, doesn't extend)", series.length === marketsOnly.length);
  check("every point is lifted by the ramped house equity", series.every((p, i) => p.total > marketsOnly[i].total));
  check("earliest lifted point sits well above the raw market base (no left-edge spike)", series[0].total > 400_000, String(Math.round(series[0].total)));
  const stepIntoToday = Math.abs((236_000 + 370_000) - series[series.length - 1].total);
  check("gentle step into today's live value (< 30k)", stepIntoToday < 30_000, `step=${Math.round(stepIntoToday)}`);
}

console.log("\nReconcile — REMOVE the house (subtract its stored trajectory, no drop):");
{
  // The house is fully removed; the stored history still carries it. Subtract
  // real_estate entirely so the line drops uniformly to the markets-only level
  // and meets today's live markets total (236k) with no cliff.
  const removals: Removal[] = [{ type: "real_estate", fraction: 1 }];
  const series = reconcileHistoryToHoldings(withHouse, [], removals, TODAY);
  check("recovers the markets-only trajectory", series.every((p, i) => near(p.total, marketsOnly[i].total, 1)));
  const stepIntoToday = Math.abs(236_000 - series[series.length - 1].total);
  check("no drop from the last point into today's live value (< 5k)", stepIntoToday < 5_000, `step=${Math.round(stepIntoToday)}`);
  check("no point stays inflated by the removed house", series.every((p) => p.total < 250_000), String(Math.round(series[series.length - 1].total)));
}

console.log("\nReconcile — partial reduction (sold half the house):");
{
  const removals: Removal[] = [{ type: "real_estate", fraction: 0.5 }];
  const series = reconcileHistoryToHoldings(withHouse, [], removals, TODAY);
  // Each point loses half its stored house equity — between markets-only and full.
  check("lands between full and markets-only", series.every((p, i) => p.total > marketsOnly[i].total && p.total < withHouse[i].total));
}

console.log("\nReconcile — no change → passthrough:");
{
  const untouched = reconcileHistoryToHoldings(marketsOnly, [], [], TODAY);
  check("returns the points unchanged", untouched.length === marketsOnly.length && untouched.every((p, i) => p.total === marketsOnly[i].total));
  const zeroExcess = reconcileHistoryToHoldings(marketsOnly, [{ asset: house, excess: 0 }], [], TODAY);
  check("zero-excess addition contributes nothing", zeroExcess.every((p, i) => p.total === marketsOnly[i].total));
  const missingType = reconcileHistoryToHoldings(marketsOnly, [], [{ type: "crypto", fraction: 1 }], TODAY);
  check("removing a type absent from history is a no-op", missingType.every((p, i) => p.total === marketsOnly[i].total));
}

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);

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
  buildProvisionalTotals,
  MAX_HISTORY_YEARS,
  type EstimableAsset,
  type PendingRamp,
  type SimplePoint,
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

console.log("\nProvisional series — has existing history (lift mode):");
// Real markets history: two years of ~230–236k, monthly-ish. Excess = the house
// equity not yet in history (its full 370k, since history has no property).
const real: SimplePoint[] = [
  { date: "2024-08-01", total: 230_000 },
  { date: "2025-02-01", total: 234_000 },
  { date: "2026-02-01", total: 236_000 },
];
const pending: PendingRamp[] = [{ asset: house, excess: 370_000 }];
const series = buildProvisionalTotals(real, pending, TODAY);

check("keeps the same points as the real history (lifts, doesn't extend)", series.length === real.length);
check("series is ascending by date", series.every((p, i) => i === 0 || p.date >= series[i - 1].date));
check("every real point is lifted by the ramped house equity", series.every((p, i) => p.total > real[i].total));
check("earliest lifted point sits well above the raw market base (no spike at the left edge)",
  series[0].total > 400_000, String(Math.round(series[0].total)));
// The step from the last provisional point to today's live value (real + full
// excess) must be gentle — that gap is exactly the spike we're removing.
const liveToday = 236_000 + 370_000;
const stepIntoToday = Math.abs(liveToday - series[series.length - 1].total);
check("no spike from the last point into today's live value (step < 30k)", stepIntoToday < 30_000,
  `step=${Math.round(stepIntoToday)}`);
let maxJump = 0;
for (let i = 1; i < series.length; i++) maxJump = Math.max(maxJump, Math.abs(series[i].total - series[i - 1].total));
check("no cliff between adjacent points (max step < 30k)", maxJump < 30_000, `maxJump=${Math.round(maxJump)}`);

console.log("\nProvisional series — cold start, no history (extend mode):");
const cold = buildProvisionalTotals([], pending, TODAY);
check("synthesizes points back toward the buy date", cold.length > 12 && cold[0].date < "2016-01-01",
  `${cold.length} pts, starts ${cold[0]?.date}`);
check("never earlier than the 30-year floor", cold[0].date >= clampHistoryStart(house.buyDate, TODAY));
check("ramps upward (older < newer)", cold[0].total < cold[cold.length - 1].total);
check("lands near full excess by the last point (≈ today's added equity)",
  near(cold[cold.length - 1].total, 370_000, 15_000), String(Math.round(cold[cold.length - 1].total)));

console.log("\nNo pending → passthrough:");
const untouched = buildProvisionalTotals(real, [], TODAY);
check("returns the real points unchanged", untouched.length === real.length && untouched.every((p, i) => p.total === real[i].total));
const zeroExcess = buildProvisionalTotals(real, [{ asset: house, excess: 0 }], TODAY);
check("zero-excess asset contributes nothing", zeroExcess.length === real.length && zeroExcess.every((p, i) => p.total === real[i].total));

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);

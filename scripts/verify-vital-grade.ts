// Unit test for the vital letter grades (pure, no I/O).
// Run:  npx tsx scripts/verify-vital-grade.ts
//
// Guards the one invariant that matters: the grade may never contradict the
// band's status word — green is always A or B, amber is always C, red is
// always D — and the A/B refinements sit where the band thresholds say.

import { vitalGrade } from "../src/lib/vitals/grade";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

const letter = (key: string, band: string, value: unknown) =>
  vitalGrade(key, band, value)?.letter ?? null;

console.log("Concentration (self-derived from investable-first pct):");
check("18% → A", letter("concentration", "green", { topPositionPct: 18 }) === "A");
check("32% → B (approaching 35)", letter("concentration", "green", { topPositionPct: 32 }) === "B");
check("42% → C (amber)", letter("concentration", "amber", { topPositionPct: 42 }) === "C");
check("60% → D (red)", letter("concentration", "red", { topPositionPct: 60 }) === "D");
check(
  "gross 68% but investable 29% → B (property lens basis)",
  letter("concentration", "green", { topPositionPct: 68, investableTopPositionPct: 29 }) === "B",
);

console.log("Leverage:");
check("35% LTV → A", letter("leverage", "green", { ltvPct: 35 }) === "A");
check("47% LTV → B", letter("leverage", "green", { ltvPct: 47 }) === "B");
check("67% LTV → C", letter("leverage", "amber", { ltvPct: 67 }) === "C");
check("80% LTV → D", letter("leverage", "red", { ltvPct: 80 }) === "D");

console.log("Drawdown:");
check("12% shock → A", letter("drawdown", "green", { shockPctOfNw: 12 }) === "A");
check("22% shock → B", letter("drawdown", "green", { shockPctOfNw: 22 }) === "B");
check("30% shock → C", letter("drawdown", "amber", { shockPctOfNw: 30 }) === "C");
check("45% shock → D", letter("drawdown", "red", { shockPctOfNw: 45 }) === "D");

console.log("Liquidity posture:");
check("2× buffer → A", letter("liquidityPosture", "green", { deployable1wPct: 30, liquidBufferPct: 15, insufficient: false }) === "A");
check("just above buffer → B", letter("liquidityPosture", "green", { deployable1wPct: 16, liquidBufferPct: 15, insufficient: false }) === "B");
check("below buffer → D", letter("liquidityPosture", "red", { deployable1wPct: 8, liquidBufferPct: 15, insufficient: false }) === "D");
check("insufficient data → no grade", letter("liquidityPosture", "green", { deployable1wPct: 0, liquidBufferPct: 15, insufficient: true }) === null);

console.log("Cash & real yield / Real growth:");
check("+1,2% real yield → A", letter("cashRealYield", "green", { realYieldPct: 1.2 }) === "A");
check("+0,1% real yield → B", letter("cashRealYield", "green", { realYieldPct: 0.1 }) === "B");
check("−1,3% real yield → C", letter("cashRealYield", "amber", { realYieldPct: -1.3 }) === "C");
check("+5% real growth → A", letter("realGrowth", "green", { real12moPct: 5 }) === "A");
check("+1% real growth → B", letter("realGrowth", "green", { real12moPct: 1 }) === "B");
check("−3% real growth → D", letter("realGrowth", "red", { real12moPct: -3 }) === "D");

console.log("Real-asset weight (no red band):");
check("55% equity → A", letter("realAssetWeight", "green", { propertyEquityPct: 55 }) === "A");
check("68% equity → B (nearing 75)", letter("realAssetWeight", "green", { propertyEquityPct: 68 }) === "B");
check("80% equity → C (amber)", letter("realAssetWeight", "amber", { propertyEquityPct: 80 }) === "C");

console.log(failures === 0 ? "\nAll vital-grade checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

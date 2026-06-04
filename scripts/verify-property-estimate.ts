// Numeric self-test for the pure property-estimate functions (no I/O, no network).
// Run:  npx tsx scripts/verify-property-estimate.ts

import { estimateValue, estimateSeries } from "../src/lib/property-estimate";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log("ok:", msg);
  } else {
    console.error("FAIL:", msg);
    failures++;
  }
}

// estimateValue(180000, '2014', {2014: 82, 2026: 160}) = 180000 × 160/82 ≈ 351,220.
const v = estimateValue(180000, "2014", { 2014: 82, 2026: 160 });
assert(v != null && Math.abs(v - 351219.51) < 1, `estimateValue(180000,'2014',{2014:82,2026:160}) ≈ 351000 (got ${v})`);

// estimateSeries is non-decreasing when the index is non-decreasing.
const idx = { 2010: 90, 2011: 90, 2012: 95, 2013: 100, 2014: 110 };
const s = estimateSeries(200000, "2010", idx);
let nonDecreasing = true;
for (let i = 1; i < s.length; i++) if (s[i].value < s[i - 1].value - 1e-6) nonDecreasing = false;
assert(s.length === 5, `estimateSeries yields one point per index year (got ${s.length})`);
assert(nonDecreasing, "estimateSeries is non-decreasing when the index is non-decreasing");
assert(Math.abs(s[0].value - 200000) < 1e-6, "estimateSeries first point equals the basis at the buy year");

// A buy year before the 1995 index start clamps to 1995's index.
const c = estimateValue(100000, "1980", { 1995: 50, 2026: 150 });
assert(c != null && Math.abs(c - 300000) < 1, `pre-1995 buy year clamps to 1995 (got ${c})`);

// Bad inputs degrade to null / empty, never throw.
assert(estimateValue(0, "2014", { 2014: 82 }) === null, "zero buyPrice → null");
assert(estimateValue(100000, "2014", {}) === null, "empty index → null");
assert(estimateSeries(100000, "notayear", { 2014: 82 }).length === 0, "unparseable buy date → empty series");

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll property-estimate self-tests passed.");

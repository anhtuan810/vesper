// Unit tests for counterfactual cash-flow derivation (pure, no I/O).
// Run:  npx tsx scripts/verify-cashflows.ts
//
// Locks the confirmed bug where a value-only revaluation of a tradeable (units
// unchanged, e.g. correcting a stored price) was treated as fresh capital
// deployed into the position — understating the "vs. holding cash" contribution.
// A cash flow exists only when the unit count actually moves.

import { cashFlowsFromMutations, type DiaryContextEntry } from "../src/lib/scenario/counterfactual-assemble";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

const mut = (o: Partial<DiaryContextEntry>): DiaryContextEntry => ({
  occurred_at: "2026-01-01", action: "edit", before_units: null, after_units: null,
  before_value: null, after_value: null, currency: "USD", symbol: "AAPL", asset_name: "Apple",
  personal_context: null, market_context: null, ...o,
});

console.log("A value-only revaluation is NOT a cash flow:");
{
  // 10 units, value edited 1000 → 1500, units unchanged — appreciation, not capital.
  const flows = cashFlowsFromMutations([
    mut({ action: "edit", before_units: 10, after_units: 10, before_value: 1000, after_value: 1500 }),
  ]);
  check("no cash flow recorded", flows.length === 0, JSON.stringify(flows));
}

console.log("A buy / add / trim / sell IS a cash flow:");
{
  const add = cashFlowsFromMutations([mut({ action: "add", before_units: null, after_units: 10, before_value: null, after_value: 1000 })]);
  check("add → +1000 deployed", add.length === 1 && add[0].amount === 1000, JSON.stringify(add));

  const buyMore = cashFlowsFromMutations([mut({ action: "edit", before_units: 10, after_units: 15, before_value: 1000, after_value: 1500 })]);
  check("buy-more (10→15) → +500 deployed", buyMore.length === 1 && buyMore[0].amount === 500, JSON.stringify(buyMore));

  const trim = cashFlowsFromMutations([mut({ action: "edit", before_units: 15, after_units: 10, before_value: 1500, after_value: 1000 })]);
  check("trim (15→10) → −500 withdrawn", trim.length === 1 && trim[0].amount === -500, JSON.stringify(trim));

  const sell = cashFlowsFromMutations([mut({ action: "remove", before_units: 10, after_units: null, before_value: 1200, after_value: null })]);
  check("remove → −1200 withdrawn", sell.length === 1 && sell[0].amount === -1200, JSON.stringify(sell));
}

console.log("A realistic log keeps only the true flows:");
{
  const flows = cashFlowsFromMutations([
    mut({ action: "add", before_units: null, after_units: 10, before_value: null, after_value: 1000 }),   // +1000
    mut({ action: "edit", before_units: 10, after_units: 10, before_value: 1000, after_value: 1800 }),    // revaluation — skip
    mut({ action: "edit", before_units: 10, after_units: 12, before_value: 1800, after_value: 2160 }),    // +360 buy-more
  ]);
  check("two flows (+1000, +360), revaluation dropped", flows.length === 2 && flows[0].amount === 1000 && flows[1].amount === 360, JSON.stringify(flows));
  const deployed = flows.reduce((s, f) => s + f.amount, 0);
  check("total deployed = 1360 (not 2360 with the phantom 1000)", deployed === 1360, String(deployed));
}

console.log(failures === 0 ? "\nAll cash-flow checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

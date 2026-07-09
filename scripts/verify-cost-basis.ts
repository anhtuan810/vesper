// Unit tests for the cost-basis / current-value separation (pure, no I/O).
// Run:  npx tsx scripts/verify-cost-basis.ts
//
// Guards the NVDA corruption: a historical-price / cost-basis update on a held
// position must set buy_price/buy_date ONLY and leave current value (units ×
// current market) intact — never collapse value to the historical cost.

import { isCostBasisOnlyEdit, applyCostBasisOnly } from "../src/lib/cost-basis";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

// 100 NVDA at ~$2,050/share ≈ $205,000 current value; historical buy at $291.67.
const HELD = { type: "stocks", symbol: "NVDA" };
const HISTORICAL = 291.67;

console.log("Historical buy-date correction (the bug):");
{
  // What the old flow sent: an edit carrying the original stated value + buy_date.
  const change: Record<string, unknown> = { action: "edit", name: "NVDA", value: 29167, buy_date: "2020-01-02" };
  check("recognised as a cost-basis-only edit", isCostBasisOnlyEdit(change, HELD));
  applyCostBasisOnly(change, HISTORICAL);
  check("buy_price recorded from historical price", change.buy_price === 291.67, String(change.buy_price));
  check("buy_date kept", change.buy_date === "2020-01-02");
  check("value NOT written (no $29,167 corruption)", !("value" in change), `value=${(change as Record<string, unknown>).value}`);
  check("units NOT re-derived", !("units" in change));
}

console.log("buy_price-only correction:");
{
  const change: Record<string, unknown> = { action: "edit", name: "NVDA", buy_price: 300 };
  check("recognised as cost-basis-only edit", isCostBasisOnlyEdit(change, HELD));
  applyCostBasisOnly(change, null);
  check("stated buy_price preserved", change.buy_price === 300);
  check("value untouched", !("value" in change));
}

console.log("NOT a basis edit (must not trigger the basis path):");
{
  const valueDelta = { action: "edit", name: "NVDA", value_delta: 5000 };
  check("value_delta edit is not basis-only", !isCostBasisOnlyEdit(valueDelta, HELD));
  const unitsEdit = { action: "edit", name: "NVDA", units: 130, buy_date: "2026-01-01" };
  check("units edit is not basis-only (size change)", !isCostBasisOnlyEdit(unitsEdit, HELD));
  const cash = { action: "edit", name: "Savings", buy_date: "2020-01-01" };
  check("non-tradeable is not basis-only", !isCostBasisOnlyEdit(cash, { type: "cash", symbol: null }));
}

console.log("Date-fill that echoes the SAME unit count is still basis-only (the import bug):");
{
  // The reported failure: the import date-fill edit re-states each holding's count
  // (same number, new buy_date). Presence of units must NOT be read as a re-
  // acquisition — else the buy_date is silently dropped and the position stays
  // dated today. A count equal to the holding's current units is not a change.
  const HELD_100 = { type: "crypto", symbol: "BTC-USD", units: 100 };
  const sameCount = { action: "edit", name: "Bitcoin", units: 100, buy_date: "2023-07-01" };
  check("same-count date-fill IS basis-only", isCostBasisOnlyEdit(sameCount, HELD_100));
  applyCostBasisOnly(sameCount, null);
  check("buy_date preserved through normalization", sameCount.buy_date === "2023-07-01", String(sameCount.buy_date));
  check("echoed units stripped (not a re-acquisition)", !("units" in sameCount));

  // A count that actually differs IS a real buy-more/trim — not basis-only.
  const changedCount = { action: "edit", name: "Bitcoin", units: 130, buy_date: "2023-07-01" };
  check("changed-count edit is NOT basis-only", !isCostBasisOnlyEdit(changedCount, HELD_100));
}

console.log(failures === 0 ? "\nAll cost-basis checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

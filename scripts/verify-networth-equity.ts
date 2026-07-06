// Unit tests for the single "a property counts as EQUITY, not market value"
// decision (pure, no I/O). Run:  npx tsx scripts/verify-networth-equity.ts
//
// This is the semantic behind a whole family of confirmed bugs — a mortgaged
// property's contribution to net worth (and to every mutation's recorded
// portfolio_total / displayed magnitude) is value − mortgage balance, in the
// add, edit AND remove paths. realEstateEquity is now the ONE definition all of
// them call; computeNetWorth routes through it too. These assertions lock the
// formula so the paths can't drift apart again.

import { realEstateEquity, computeNetWorth } from "../src/lib/utils";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

console.log("realEstateEquity(value, balance) — the single shared definition:");
{
  check("value − balance", realEstateEquity(500_000, 300_000) === 200_000, String(realEstateEquity(500_000, 300_000)));
  check("null balance → full value (owned outright)", realEstateEquity(500_000, null) === 500_000);
  check("undefined balance → full value", realEstateEquity(500_000, undefined) === 500_000);
  check("zero balance → full value", realEstateEquity(500_000, 0) === 500_000);
  // A paydown is a positive equity delta of exactly the amount paid.
  const before = realEstateEquity(392_833, 156_907);
  const after = realEstateEquity(392_833, 146_907);
  check("a €10,000 paydown is a +€10,000 equity delta", after - before === 10_000, String(after - before));
}

console.log("computeNetWorth counts a mortgaged property as equity:");
{
  // No mortgage_balance_recorded_at ⇒ computeCurrentBalance returns the stored
  // balance (no amortisation), so net worth = value − stored balance.
  const nw = computeNetWorth([
    { type: "real_estate", value: 500_000, currency: "EUR", mortgage_balance: 300_000 },
  ]);
  check("property 500k / mortgage 300k → 200k equity", nw === 200_000, String(nw));

  const outright = computeNetWorth([
    { type: "real_estate", value: 500_000, currency: "EUR", mortgage_balance: null },
  ]);
  check("owned-outright property → full value", outright === 500_000, String(outright));
}

console.log("Income pensions never contribute; other classes use value:");
{
  const nw = computeNetWorth([
    { type: "real_estate", value: 500_000, currency: "EUR", mortgage_balance: 300_000 }, // 200k
    { type: "stocks", value: 50_000, currency: "EUR" },                                  // 50k
    { type: "pension", value: 120_000, currency: "EUR", pension_kind: "dc" },            // 120k (capital)
    { type: "pension", value: 0, currency: "EUR", pension_kind: "db" },                  // 0 (income entitlement)
    { type: "cash", value: 10_000, currency: "EUR" },                                    // 10k
  ]);
  check("mixed portfolio nets to 380k (income pension excluded)", nw === 380_000, String(nw));
}

console.log("The USD bridge is applied per-asset (equity converts, not gross):");
{
  // toUsd halves EUR→USD here purely to prove the mortgage is subtracted BEFORE
  // conversion drift can double-count it.
  const half = (amount: number, cur: string) => (cur === "EUR" ? amount * 0.5 : amount);
  const nw = computeNetWorth(
    [{ type: "real_estate", value: 500_000, currency: "EUR", mortgage_balance: 300_000 }],
    half,
  );
  check("equity 200k × 0.5 = 100k (not 500k×0.5 − 300k)", nw === 100_000, String(nw));
}

console.log(failures === 0 ? "\nAll net-worth-equity checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

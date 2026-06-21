// Unit tests for the deterministic data-collection guards that protect the chat
// write path (pure, no I/O). These are the server-side backstops that stop an
// invalid position from ever being saved, regardless of what the model emits.
// Run:  npx tsx scripts/verify-validations.ts

import { validatePortfolioChanges } from "../src/lib/validations";
import { validatePensionChange, pensionShapeOfKind } from "../src/lib/pension-intake";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

console.log("Portfolio-change guard (validatePortfolioChanges):");
{
  const noAssets: { name: string; symbol?: string | null; type?: string; units?: number | null }[] = [];
  check("zero-unit add is rejected", validatePortfolioChanges([{ action: "add", name: "NVDA", units: 0 }], noAssets) !== null);
  check("negative-value add is rejected", validatePortfolioChanges([{ action: "add", name: "NVDA", value: -100 }], noAssets) !== null);
  check("valid units add passes", validatePortfolioChanges([{ action: "add", name: "NVDA", units: 10 }], noAssets) === null);
  check("valid value add passes", validatePortfolioChanges([{ action: "add", name: "Savings", value: 5000 }], noAssets) === null);

  const held = [{ name: "NVDA", symbol: "NVDA", type: "stocks", units: 100 }];
  check("negative-units edit is rejected", validatePortfolioChanges([{ action: "edit", name: "NVDA", units: -5 }], held) !== null);
  check("negative-value edit is rejected", validatePortfolioChanges([{ action: "edit", name: "NVDA", value: -1 }], held) !== null);
  check("remove is never blocked by the size guard", validatePortfolioChanges([{ action: "remove", name: "NVDA" }], held) === null);
}

console.log("Pension gate — an incomplete pension can never commit:");
{
  check("no kind → not ok (ask which kind)", validatePensionChange({ type: "pension" }).ok === false);
  check("dc without value → not ok", validatePensionChange({ type: "pension", pension_kind: "dc" }).ok === false);
  check("dc without growth → not ok", validatePensionChange({ type: "pension", pension_kind: "dc", value: 120000 }).ok === false);
  check("dc without access age → not ok", validatePensionChange({ type: "pension", pension_kind: "dc", value: 120000, mortgage_rate: 4 }).ok === false);
  check("dc complete → ok", validatePensionChange({ type: "pension", pension_kind: "dc", value: 120000, mortgage_rate: 4, access_age: 67 }).ok === true);
  check("db without income → not ok", validatePensionChange({ type: "pension", pension_kind: "db" }).ok === false);
  check("db with income → ok", validatePensionChange({ type: "pension", pension_kind: "db", annual_income: 18000 }).ok === true);
  check(
    "shape: dc=capital, db/state=income",
    pensionShapeOfKind("dc") === "capital" && pensionShapeOfKind("db") === "income" && pensionShapeOfKind("state") === "income",
  );
}

console.log(failures === 0 ? "\nAll validation-guard checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

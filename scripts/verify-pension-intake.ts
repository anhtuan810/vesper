// Unit tests for the deterministic pension intake gate (pure, no I/O). Guards the
// two-shape contract: a CAPITAL (dc) pot needs value + growth assumption + access
// age; an INCOME (db/state) entitlement needs an annual income. Enforced in both
// the proposal/echo step (proposal-resolver) and the write path (apply-changes).
// Run:  npx tsx scripts/verify-pension-intake.ts

import { validatePensionChange, pensionShapeOfKind, isPensionChange } from "../src/lib/pension-intake";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

console.log("Pension gate — kind must be stated:");
{
  check(
    "no kind → asks which kind",
    validatePensionChange({ type: "pension" }).ok === false &&
      (validatePensionChange({ type: "pension" }) as { question: string }).question.toLowerCase().includes("kind"),
  );
}

console.log("Pension gate — capital (dc) needs value + growth + access age:");
{
  const base = { type: "pension", pension_kind: "dc" as const };
  check("dc missing everything → asks for value", validatePensionChange(base).ok === false);
  check(
    "dc value but no growth → asks for growth",
    validatePensionChange({ ...base, value: 100000 }).ok === false &&
      (validatePensionChange({ ...base, value: 100000 }) as { question: string }).question.toLowerCase().includes("growth"),
  );
  // The fix under test: an EXPLICIT 0% growth is a legitimate answer, not a
  // missing one — it must pass the growth check rather than loop the re-ask.
  check(
    "dc with explicit 0% growth + access age → ok (no re-ask loop)",
    validatePensionChange({ ...base, value: 100000, mortgage_rate: 0, access_age: 67 }).ok === true,
  );
  check(
    "dc with negative (real-terms) growth → ok",
    validatePensionChange({ ...base, value: 100000, mortgage_rate: -1, access_age: 67 }).ok === true,
  );
  check(
    "dc with positive growth but no access age → asks for age",
    validatePensionChange({ ...base, value: 100000, mortgage_rate: 4 }).ok === false &&
      (validatePensionChange({ ...base, value: 100000, mortgage_rate: 4 }) as { question: string }).question.toLowerCase().includes("age"),
  );
  check(
    "dc fully specified → ok",
    validatePensionChange({ ...base, value: 100000, mortgage_rate: 4, access_age: 68 }).ok === true,
  );
  check(
    "dc with zero value → not ok (a pot needs a positive balance)",
    validatePensionChange({ ...base, value: 0, mortgage_rate: 4, access_age: 68 }).ok === false,
  );
}

console.log("Pension gate — income (db/state) needs an annual income:");
{
  check("db no income → asks for income", validatePensionChange({ type: "pension", pension_kind: "db" }).ok === false);
  check("db with annual income → ok", validatePensionChange({ type: "pension", pension_kind: "db", annual_income: 30000 }).ok === true);
  check("state with annual income → ok", validatePensionChange({ type: "pension", pension_kind: "state", annual_income: 15000 }).ok === true);
  check("income shape needs no growth/access-age", validatePensionChange({ type: "pension", pension_kind: "state", annual_income: 15000 }).ok === true);
}

console.log("Pension shape + classifier:");
{
  check("dc → capital", pensionShapeOfKind("dc") === "capital");
  check("db → income", pensionShapeOfKind("db") === "income");
  check("state → income", pensionShapeOfKind("state") === "income");
  check("null kind → capital (legacy default)", pensionShapeOfKind(null) === "capital");
  check("pension is a pension change", isPensionChange({ type: "pension" }) === true);
  check("cash is not a pension change", isPensionChange({ type: "cash" }) === false);
}

console.log("\n" + "=".repeat(60));
if (failures > 0) {
  console.log(`✗ ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("✓ all pension-intake checks passed");

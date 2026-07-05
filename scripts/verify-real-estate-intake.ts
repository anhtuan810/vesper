// Unit tests for the deterministic real-estate intake gate (pure, no I/O). This
// is the server-side backstop that stops a property from ever being saved with a
// silent "owned outright" default when a mortgage was never captured — the bug
// where a house added WITH a mortgage recorded as having none. Enforced in both
// the proposal/echo step (proposal-resolver) and the write path (apply-changes).
// Run:  npx tsx scripts/verify-real-estate-intake.ts

import { validateRealEstateChange, isRealEstateChange } from "../src/lib/real-estate-intake";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

console.log("Real-estate gate — value must be resolvable:");
{
  // No value and no purchase → ask for a value.
  check(
    "value + mortgage both missing → not ok (ask for value first)",
    validateRealEstateChange({ type: "real_estate" }).ok === false,
  );
  check(
    "address-only add (no value, no purchase) → asks for value",
    validateRealEstateChange({ type: "real_estate" }).ok === false &&
      (validateRealEstateChange({ type: "real_estate" }) as { question: string }).question
        .toLowerCase()
        .includes("worth"),
  );
  // A purchase (price + date) lets the estimate engine derive a value, so the
  // value requirement is satisfied even without a stated current value.
  check(
    "purchase price + date (no value) satisfies the value requirement",
    validateRealEstateChange({ type: "real_estate", buy_price: 300000, buy_date: "2015-06" }).ok === false &&
      (validateRealEstateChange({ type: "real_estate", buy_price: 300000, buy_date: "2015-06" }) as { question: string })
        .question.toLowerCase()
        .includes("mortgage"),
  );
  check(
    "buy_price without a date does NOT satisfy value → asks for value",
    validateRealEstateChange({ type: "real_estate", buy_price: 300000 }).ok === false &&
      (validateRealEstateChange({ type: "real_estate", buy_price: 300000 }) as { question: string })
        .question.toLowerCase()
        .includes("worth"),
  );
}

console.log("Real-estate gate — the mortgage decision must be explicit:");
{
  // The crux: a property with a value but NO mortgage decision must be blocked,
  // so it can never silently record as owned outright.
  const g = validateRealEstateChange({ type: "real_estate", value: 770000 });
  check("value but no mortgage decision → not ok", g.ok === false);
  check(
    "the question asks about the mortgage",
    g.ok === false && g.question.toLowerCase().includes("mortgage"),
  );

  // An explicit outstanding balance completes the add.
  check(
    "value + outstanding mortgage balance → ok",
    validateRealEstateChange({ type: "real_estate", value: 770000, mortgage_balance: 250000 }).ok === true,
  );

  // 0 is a VALID explicit answer — "owned free and clear".
  check(
    "value + mortgage_balance 0 (owned outright) → ok",
    validateRealEstateChange({ type: "real_estate", value: 770000, mortgage_balance: 0 }).ok === true,
  );

  // A negative balance is not a valid answer.
  check(
    "negative mortgage balance → not ok",
    validateRealEstateChange({ type: "real_estate", value: 770000, mortgage_balance: -1 }).ok === false,
  );

  // Complete via a purchase + an explicit balance.
  check(
    "purchase + mortgage balance → ok",
    validateRealEstateChange({ type: "real_estate", buy_price: 300000, buy_date: "2015", mortgage_balance: 120000 }).ok === true,
  );
}

console.log("Real-estate classifier:");
{
  check("real_estate is a property change", isRealEstateChange({ type: "real_estate" }) === true);
  check("stocks is not a property change", isRealEstateChange({ type: "stocks" }) === false);
}

console.log(failures === 0 ? "\nAll real-estate intake checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

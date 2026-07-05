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
  // A purchase (price + date) lets the CBS estimate engine derive a value — but
  // ONLY for a NL property, which is the only country the engine can index. So a
  // purchase anchor satisfies the value requirement when country is NL: the gate
  // proceeds past the value check and stops at the mortgage question.
  check(
    "NL purchase price + date (no value) satisfies the value requirement",
    validateRealEstateChange({ type: "real_estate", country: "NL", buy_price: 300000, buy_date: "2015-06" }).ok === false &&
      (validateRealEstateChange({ type: "real_estate", country: "NL", buy_price: 300000, buy_date: "2015-06" }) as { question: string })
        .question.toLowerCase()
        .includes("mortgage"),
  );
  // A non-NL property cannot be estimated, so a purchase anchor is NOT a
  // resolvable value there — the gate must ask for the current value at intake
  // (not pass here and then bounce at commit when the estimate comes back empty).
  check(
    "non-NL purchase price + date (no value) → asks for value",
    validateRealEstateChange({ type: "real_estate", country: "US", buy_price: 300000, buy_date: "2015-06" }).ok === false &&
      (validateRealEstateChange({ type: "real_estate", country: "US", buy_price: 300000, buy_date: "2015-06" }) as { question: string })
        .question.toLowerCase()
        .includes("worth"),
  );
  check(
    "country-less purchase price + date (no value) → asks for value",
    validateRealEstateChange({ type: "real_estate", buy_price: 300000, buy_date: "2015-06" }).ok === false &&
      (validateRealEstateChange({ type: "real_estate", buy_price: 300000, buy_date: "2015-06" }) as { question: string })
        .question.toLowerCase()
        .includes("worth"),
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

  // 0 is a VALID explicit answer — "owned free and clear" — and needs nothing more.
  check(
    "value + mortgage_balance 0 (owned outright) → ok",
    validateRealEstateChange({ type: "real_estate", value: 770000, mortgage_balance: 0 }).ok === true,
  );

  // A negative balance is not a valid answer.
  check(
    "negative mortgage balance → not ok",
    validateRealEstateChange({ type: "real_estate", value: 770000, mortgage_balance: -1 }).ok === false,
  );
}

console.log("Real-estate gate — a mortgage needs rate + payment + type (payoff inputs):");
{
  const withBalance = (extra: Record<string, unknown>) =>
    validateRealEstateChange({ type: "real_estate", value: 770000, mortgage_balance: 250000, ...extra });

  // Balance alone no longer completes the add — the payoff fields are required.
  const noRate = withBalance({});
  check("mortgage balance but no rate → not ok", noRate.ok === false);
  check("asks about the interest rate", noRate.ok === false && noRate.question.toLowerCase().includes("rate"));

  const noPayment = withBalance({ mortgage_rate: 3.5 });
  check("rate but no payment → not ok", noPayment.ok === false);
  check("asks about the monthly payment", noPayment.ok === false && noPayment.question.toLowerCase().includes("payment"));

  const noType = withBalance({ mortgage_rate: 3.5, monthly_payment: 1400 });
  check("rate + payment but no type → not ok", noType.ok === false);

  check(
    "invalid mortgage_type → not ok",
    withBalance({ mortgage_rate: 3.5, monthly_payment: 1400, mortgage_type: "balloon" }).ok === false,
  );

  check(
    "balance + rate + payment + type → ok",
    withBalance({ mortgage_rate: 3.5, monthly_payment: 1400, mortgage_type: "annuity" }).ok === true,
  );

  // 0% is a valid explicit rate (an interest-free loan), not a missing answer.
  check(
    "interest-free (rate 0) + payment + type → ok",
    withBalance({ mortgage_rate: 0, monthly_payment: 1400, mortgage_type: "linear" }).ok === true,
  );

  // Owned outright (balance 0) needs none of the payoff fields.
  check(
    "owned outright needs no rate/payment/type",
    validateRealEstateChange({ type: "real_estate", value: 770000, mortgage_balance: 0 }).ok === true,
  );

  // Full complete add via a purchase anchor + a mortgage (NL, so the purchase
  // anchor resolves a value via the estimate engine).
  check(
    "NL purchase + full mortgage → ok",
    validateRealEstateChange({
      type: "real_estate", country: "NL", buy_price: 300000, buy_date: "2015",
      mortgage_balance: 120000, mortgage_rate: 2.9, monthly_payment: 900, mortgage_type: "interest_only",
    }).ok === true,
  );
}

console.log("Real-estate classifier:");
{
  check("real_estate is a property change", isRealEstateChange({ type: "real_estate" }) === true);
  check("stocks is not a property change", isRealEstateChange({ type: "stocks" }) === false);
}

console.log(failures === 0 ? "\nAll real-estate intake checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

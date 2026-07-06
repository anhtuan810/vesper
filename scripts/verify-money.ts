// Unit tests for client money formatting / conversion (pure, no I/O).
// Run:  npx tsx scripts/verify-money.ts
//
// Locks the confirmed foreign-currency bugs: a holding in a currency outside the
// three DISPLAY currencies (a Tokyo/Zürich/Toronto/Hong-Kong listing) must
// convert through USD like any other — not fail to null and get counted as 0 in
// totals (toDisplay) while its own row shows ~100× the real value (formatMoney).
// Rates come from the bundled majors fallback (no live fetch in a test), so the
// expected figures are deterministic: USD_FALLBACK_RATES = {EUR .89, GBP .76,
// CHF .84, JPY 143, CAD 1.39, AUD 1.56, HKD 7.79}.

import { toDisplay, formatMoney, formatMoneyCompact, getUsdRate } from "../src/lib/money";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

console.log("A non-display currency converts (was null → 0 in totals):");
{
  // 3,000,000 JPY ÷ 143 × 0.89 ≈ €18,671 — not null, not 0, not millions.
  const d = toDisplay(3_000_000, "JPY", "EUR");
  check("toDisplay(3,000,000 JPY → EUR) is a number", typeof d === "number" && d !== null, String(d));
  check("…and lands ~€18–19k, not 0", d != null && d > 15_000 && d < 22_000, String(d));
  check("CHF converts too", (() => { const v = toDisplay(100_000, "CHF", "EUR"); return v != null && v > 90_000 && v < 130_000; })());
  check("CAD converts too", (() => { const v = toDisplay(100_000, "CAD", "USD"); return v != null && v > 60_000 && v < 85_000; })());
}

console.log("The same holding formats to the same sane figure in its row (was ~100× over):");
{
  // formatMoney must AGREE with toDisplay — the row and the total can't disagree.
  check('formatMoney(3,000,000 JPY → EUR) === "€18.671"', formatMoney(3_000_000, "JPY", "EUR") === "€18.671", formatMoney(3_000_000, "JPY", "EUR"));
  check("…and is NOT the ~€2.670.000 mis-scaling", !formatMoney(3_000_000, "JPY", "EUR").includes("2.670.000"));
}

console.log("GBp (pence) is a hundredth of a pound:");
{
  check("toDisplay(50,000 GBp → GBP) === 500", toDisplay(50_000, "GBp", "GBP") === 500, String(toDisplay(50_000, "GBp", "GBP")));
  check('formatMoney(50,000 GBp → GBP) === "£500"', formatMoney(50_000, "GBp", "GBP") === "£500", formatMoney(50_000, "GBp", "GBP"));
  check("getUsdRate('GBp') === GBP×100", getUsdRate("GBp") === getUsdRate("GBP") * 100, String(getUsdRate("GBp")));
}

console.log("Identity and supported currencies unchanged:");
{
  check('formatMoney(1000 EUR → EUR) === "€1.000"', formatMoney(1_000, "EUR", "EUR") === "€1.000", formatMoney(1_000, "EUR", "EUR"));
  check("toDisplay identity returns input", toDisplay(1234, "EUR", "EUR") === 1234);
  check("USD→USD identity", getUsdRate("USD") === 1);
}

console.log("Compact rollover: no four-digit K (L4):");
{
  check('formatMoneyCompact(999,600) === "€1,0M"', formatMoneyCompact(999_600, "EUR", "EUR") === "€1,0M", formatMoneyCompact(999_600, "EUR", "EUR"));
  check('formatMoneyCompact(1,000,000) === "€1,0M"', formatMoneyCompact(1_000_000, "EUR", "EUR") === "€1,0M", formatMoneyCompact(1_000_000, "EUR", "EUR"));
  check('formatMoneyCompact(999,000) === "€999K"', formatMoneyCompact(999_000, "EUR", "EUR") === "€999K", formatMoneyCompact(999_000, "EUR", "EUR"));
  check('formatMoneyCompact(115,000) === "€115K"', formatMoneyCompact(115_000, "EUR", "EUR") === "€115K", formatMoneyCompact(115_000, "EUR", "EUR"));
  check('formatMoneyCompact(640) === "€640"', formatMoneyCompact(640, "EUR", "EUR") === "€640", formatMoneyCompact(640, "EUR", "EUR"));
}

console.log(failures === 0 ? "\nAll money checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

// Unit tests for mortgage amortization / payoff (pure, no I/O).
// Run:  npx tsx scripts/verify-mortgage.ts
//
// Locks the semantics behind the "Mortgage-free date is wrong" and the inflated
// "X years sooner" bugs: when a real monthly payment is stated, the payoff must
// come from amortising THAT payment (projectMortgage with no end date), not from
// the calendar maturity. Passing the end date reported the contractual term and
// ignored an over- or under-payment — and the extra-payment saving was then
// measured against that wrong baseline.

import { projectMortgage, annuityPayment } from "../src/lib/mortgage";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}
const between = (n: number, lo: number, hi: number) => n >= lo && n <= hi;

const start = new Date("2015-01-01");
const today = new Date("2025-01-01"); // 120 months elapsed
const end = new Date("2045-01-01");   // 360-month contractual term

console.log("An over-payment clears the loan before the contractual end date:");
{
  // balance 300k, 3%/yr, stated 2000/mo (interest is 750/mo → ~1250 principal).
  const real = projectMortgage(300_000, 3, 2000, "annuity", start, today, undefined);
  const calendar = projectMortgage(300_000, 3, 2000, "annuity", start, today, end);
  check("real payoff amortises the payment (~188 months left)", between(real.remainingMonths, 184, 192), String(real.remainingMonths));
  check("calendar payoff just reports the term (240 months left)", between(calendar.remainingMonths, 237, 243), String(calendar.remainingMonths));
  check("real payoff is SOONER than the calendar term", real.remainingMonths < calendar.remainingMonths, `${real.remainingMonths} < ${calendar.remainingMonths}`);
  check("real payoff date is before the end date", real.payoffDate != null && real.payoffDate < end);
}

console.log("The extra-payment saving is measured against the REAL baseline:");
{
  const realBaseline = projectMortgage(300_000, 3, 2000, "annuity", start, today, undefined).remainingMonths;
  const calendarBaseline = projectMortgage(300_000, 3, 2000, "annuity", start, today, end).remainingMonths;
  const withExtra = projectMortgage(300_000, 3, 2100, "annuity", start, today, undefined).remainingMonths;

  const realSaved = realBaseline - withExtra;      // fixed: ~1 year
  const bogusSaved = calendarBaseline - withExtra; // old bug: ~5 years

  check("real saving from +€100 is a realistic ~1 year", between(realSaved, 6, 18), `${realSaved} months`);
  check("the OLD calendar baseline inflated it to years", bogusSaved > 48, `${bogusSaved} months`);
  check("the fix shrinks the claim by years", bogusSaved - realSaved > 36, `${bogusSaved - realSaved} months of inflation removed`);
}

console.log("Edge cases:");
{
  // Zero interest: months = balance / payment.
  const zero = projectMortgage(120_000, 0, 1_000, "annuity", start, today, undefined);
  check("0% loan: 120,000 / 1,000 = 120 months", zero.remainingMonths === 120, String(zero.remainingMonths));

  // Payment below the monthly interest can never amortise.
  const stuck = projectMortgage(300_000, 3, 700, "annuity", start, today, undefined); // interest = 750
  check("payment below interest → flagged, no payoff", stuck.status === "payment_below_interest" && stuck.payoffDate === null);

  // Interest-only: the payoff IS the end date.
  const io = projectMortgage(300_000, 3, 750, "interest_only", start, today, end);
  check("interest-only payoff = end date", io.payoffDate?.getTime() === end.getTime());

  // annuityPayment sanity: the payment that clears 300k over 360 months amortises
  // the current balance in ~360 months from today.
  const contractual = annuityPayment(300_000, 3, 360);
  const atContractual = projectMortgage(300_000, 3, contractual, "annuity", start, today, undefined);
  check("contractual payment amortises in ~360 months", between(atContractual.remainingMonths, 355, 365), String(atContractual.remainingMonths));
}

console.log(failures === 0 ? "\nAll mortgage checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

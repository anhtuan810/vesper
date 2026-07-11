// Behaviour suite for the chat guardrail's percent tolerance
// (src/lib/narrate/guardrail.ts). Pure — no network, DB, or LLM.
// Run:  npx tsx scripts/verify-guardrail-tolerance.ts
//
// The July 2026 "no reply" incident: any money/percent token in the reply that
// wasn't byte-identical to a tool-returned figure nuked the whole answer down
// to a bare "Here's what I found." — and the most common non-identical tokens
// are legitimate rewrites of the SAME number: a rounded percent ("62.5%"
// narrated as "63%") or its comma-decimal twin ("62,5%"). withPercentTolerance
// admits exactly those two spellings per percent figure and nothing else;
// money amounts must still match verbatim, so fabrication still trips.

import {
  withPercentTolerance,
  offendingMonetaryTokens,
  validateMonetaryNarration,
} from "../src/lib/narrate/guardrail";

let failures = 0;
function check(name: string, ok: boolean): void {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok) failures++;
}

// Figures shaped exactly like the agent tools produce them for a EUR user
// (formatMoney nl-NL money, pct() one-decimal dot percents).
const figures = ["€399.852", "62.5%", "21.1%", "1.4%", "15.0%", "7.0%"];
const allowed = withPercentTolerance(figures);

check("every original figure survives expansion", figures.every((f) => allowed.includes(f)));
check(
  "rounded-integer percent variants are admitted",
  ["63%", "21%", "1%", "15%", "7%"].every((f) => allowed.includes(f)),
);
check("half-up rounding (62.5% → 63%, not 62%)", allowed.includes("63%") && !allowed.includes("62%"));
check("comma-decimal twins are admitted", ["62,5%", "21,1%", "1,4%", "15,0%"].every((f) => allowed.includes(f)));
check(
  "money figures get NO variants",
  allowed.filter((f) => f.includes("€")).length === 1 && allowed.includes("€399.852"),
);
check("non-percent, non-money strings pass through untouched", withPercentTolerance(["9.6x"]).join() === "9.6x");

// A realistic diversification reply: markdown bold, some percents rounded,
// some verbatim, money verbatim.
const reply =
  "Your portfolio leans heavily on **Property** at **63%** of your **€399.852**. " +
  "**Public markets** are **21.1%**, **Reserves** **15%**, and **Crypto** just **1,4%**.";
check("realistic rounded reply passes with tolerance", offendingMonetaryTokens(reply, allowed).length === 0);
check(
  "the same reply FAILS without tolerance (why this exists)",
  !validateMonetaryNarration(reply, figures),
);

// Fabrication still trips, and the offending token is reported.
check(
  "fabricated money amount still offends",
  offendingMonetaryTokens("You hold **€12.345** in gold.", allowed).includes("€12.345"),
);
check(
  "fabricated percent still offends",
  offendingMonetaryTokens("Gold is **40%** of the portfolio.", allowed).includes("40%"),
);
check(
  "rounded money is NOT tolerated (different figure)",
  offendingMonetaryTokens("That's about **€400.000** in total.", allowed).includes("€400.000"),
);
check(
  "bare counts and years never offend",
  offendingMonetaryTokens("You have 18 positions, the oldest from 2 years ago.", allowed).length === 0,
);
check("clean reply reports no offenders", offendingMonetaryTokens("Nicely spread overall.", allowed).length === 0);

console.log(
  failures === 0 ? "\nAll guardrail-tolerance checks passed." : `\n${failures} guardrail-tolerance check(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);

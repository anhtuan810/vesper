// Behaviour suite for the chat guardrail's same-number tolerance
// (src/lib/narrate/guardrail.ts) and the verified-figure fallback renderer
// (src/lib/chat/figure-fallback.ts). Pure — no network, DB, or LLM.
// Run:  npx tsx scripts/verify-guardrail-tolerance.ts
//
// The July 2026 "no reply" incident: any money/percent token in the reply that
// wasn't byte-identical to a tool-returned figure nuked the whole answer down
// to a bare "Here's what I found." — and the most common non-identical tokens
// are legitimate rewrites of the SAME number:
//   • separator convention — formatMoney emits Dutch-style "€399.852" for every
//     display currency, an English narration writes "€399,852" (canonical
//     comparison makes these equal);
//   • a rounded percent — "62.5%" narrated as "63%" (withPercentTolerance);
//   • a comma-decimal percent — "62,5%" (both mechanisms cover it).
// Money amounts with different DIGITS still trip, so fabrication is caught.

import {
  withPercentTolerance,
  offendingMonetaryTokens,
  validateMonetaryNarration,
  extractMonetaryNumbers,
} from "../src/lib/narrate/guardrail";
import { figureLines } from "../src/lib/chat/figure-fallback";
import { formatMoney } from "../src/lib/money";

let failures = 0;
function check(name: string, ok: boolean): void {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok) failures++;
}

// ── The formatter really does emit Dutch-style grouping (the premise) ────────
const nw = formatMoney(399852, "EUR", "EUR");
check(`formatMoney emits Dutch grouping (got ${nw})`, nw === "€399.852");

// Figures shaped exactly like the agent tools produce them for a EUR user.
const figures = [nw, "62.5%", "21.1%", "1.4%", "15.0%", "7.0%"];
const allowed = withPercentTolerance(figures);

// ── Canonical money comparison: same number, any separator convention ────────
check("verbatim Dutch-style money passes", validateMonetaryNarration("Net worth is **€399.852**.", figures));
check("English-style rewrite of the SAME amount passes", validateMonetaryNarration("Net worth is **€399,852**.", figures));
check("separator-free spelling of the SAME amount passes", validateMonetaryNarration("Net worth is **€399852**.", figures));
check("different digits still trip (€39.985)", !validateMonetaryNarration("Net worth is **€39.985**.", figures));
check("a decimal is not a grouping (€1.50 ≠ €150)", !validateMonetaryNarration("**€1.50**", ["€150"]));
check("comma-decimal percent passes via canonical alone", validateMonetaryNarration("Property is **62,5%**.", figures));

// ── Percent rounding tolerance ────────────────────────────────────────────────
check("every original figure survives expansion", figures.every((f) => allowed.includes(f)));
check(
  "rounded-integer percent variants are admitted",
  ["63%", "21%", "1%", "15%", "7%"].every((f) => allowed.includes(f)),
);
check("half-up rounding (62.5% → 63%, not 62%)", allowed.includes("63%") && !allowed.includes("62%"));
check(
  "money figures get NO variants",
  allowed.filter((f) => f.includes("€")).length === 1 && allowed.includes(nw),
);
check("non-percent, non-money strings pass through untouched", withPercentTolerance(["9.6x"]).join() === "9.6x");

// A realistic diversification reply: markdown bold, some percents rounded,
// some verbatim, money in the English convention.
const reply =
  "Your portfolio leans heavily on **Property** at **63%** of your **€399,852**. " +
  "**Public markets** are **21.1%**, **Reserves** **15%**, and **Crypto** just **1,4%**.";
check("realistic mixed-style reply passes with tolerance", offendingMonetaryTokens(reply, allowed).length === 0);
check(
  "the same reply FAILS without rounding tolerance (why it exists)",
  !validateMonetaryNarration(reply, figures),
);

// ── Fabrication still trips, and the offending token is reported ─────────────
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

// ── Cross-turn quoting: conversation-visible figures join the allowlist ──────
// The agent loop seeds the allowed set with extractMonetaryNumbers over the
// user's message and the recent thread, so a follow-up can echo the previous
// answer's own numbers ("…of your €365.448 net worth") without being erased.
const prevAnswer =
  "**Property** makes up **68.4%** of your **€365.448** net worth, with **Reserves** at **16.4%**.";
const conversationFigures = extractMonetaryNumbers(prevAnswer);
const followUpReply = "Apple has added **€22.000** overall — a small slice next to your **€365.448** net worth.";
const toolFigures = ["€22.000"];
check(
  "follow-up echoing the previous answer passes once conversation figures are seeded",
  offendingMonetaryTokens(followUpReply, withPercentTolerance([...toolFigures, ...conversationFigures])).length === 0,
);
check(
  "the same follow-up FAILS on tool figures alone (why the seeding exists)",
  offendingMonetaryTokens(followUpReply, withPercentTolerance(toolFigures)).includes("€365.448"),
);
check(
  "a from-nowhere number still offends even with conversation figures seeded",
  offendingMonetaryTokens("Apple is **€99.999** of it.", withPercentTolerance([...toolFigures, ...conversationFigures]))
    .includes("€99.999"),
);

// ── Verified-figure fallback renderer ────────────────────────────────────────
const vitals = {
  netWorth: "€399.852",
  allocation: [
    { category: "Property", share: "62.5%" },
    { category: "Public markets", share: "21.1%" },
  ],
  singleNameConcentration: "8.2%",
  topSingleName: "NVIDIA",
  mortgageLtv: "40.8%",
};
const vitalsText = figureLines("get_vitals", vitals);
check(
  "vitals fallback renders net worth, allocation, concentration, LTV",
  ["€399.852", "Property", "62.5%", "Public markets", "21.1%", "NVIDIA", "8.2%", "40.8%"].every((s) =>
    vitalsText.includes(s),
  ),
);
check(
  "vitals fallback narrates ONLY allowlisted figures (would survive its own guardrail)",
  offendingMonetaryTokens(vitalsText, ["€399.852", "62.5%", "21.1%", "8.2%", "40.8%"]).length === 0,
);

const holdings = {
  holdings: [
    { name: "NVIDIA", value: "€3.407", units: "40" },
    { name: "Amsterdam apartment", value: "€250.000" },
  ],
  count: 2,
  netWorth: "€399.852",
};
const holdingsText = figureLines("get_holdings", holdings);
check(
  "holdings fallback renders each position and the net worth",
  ["NVIDIA", "€3.407", "40 units", "Amsterdam apartment", "€250.000", "€399.852"].every((s) =>
    holdingsText.includes(s),
  ),
);
check("unknown tool renders nothing", figureLines("commit_mutation", { committed: true }) === "");
check("malformed rows are skipped, not thrown", figureLines("get_holdings", { holdings: [null, { name: 3 }] }) === "");

console.log(
  failures === 0 ? "\nAll guardrail-tolerance checks passed." : `\n${failures} guardrail-tolerance check(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);

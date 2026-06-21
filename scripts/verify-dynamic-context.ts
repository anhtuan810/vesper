// Unit test for the chat's portfolio context builder (pure, no I/O).
// Run:  npx tsx scripts/verify-dynamic-context.ts
//
// Guards the net-worth presentation bug: the context must hand the model the
// net worth ALREADY in the user's display currency, so the model never does FX
// on the headline figure (it was overstating net worth for EUR/GBP users by
// quoting the USD-equivalent as if it were euros).

import { buildDynamicContext } from "../src/lib/claude";
import type { Asset } from "../src/lib/supabase";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

// €90,000 of EUR cash. usdRates[EUR] = 0.9 (0.9 EUR per 1 USD), so the context's
// USD total is 90,000 / 0.9 = $100,000, and the display figure converts back to
// €90,000. The two are deliberately distinct (€90k vs $100k) so we can tell which
// one the headline shows.
const assets = [{ id: "1", name: "Savings", type: "cash", value: 90000, currency: "EUR" }] as unknown as Asset[];
const usdRates = { EUR: 0.9 };

console.log("EUR user — net worth headline is in EUR, not USD-equivalent:");
{
  const ctx = buildDynamicContext(assets, {}, [], "EUR", "Tester", usdRates);
  const nwLine = ctx.split("\n").find((l) => l.includes("net worth")) ?? "";
  check("net worth shown as €90,000", /net worth ~€90,000/.test(nwLine), nwLine.trim());
  check("does not show the $100,000 USD-equivalent figure", !/100,000/.test(nwLine) && !/USD-equivalent/.test(nwLine), nwLine.trim());
  check("instructs the model to quote it directly (no conversion)", /already in EUR|do not convert/i.test(ctx));
}

console.log("USD user — headline stays in USD:");
{
  const ctx = buildDynamicContext(assets, {}, [], "USD", "Tester", { EUR: 0.9 });
  const nwLine = ctx.split("\n").find((l) => l.includes("net worth")) ?? "";
  // €90,000 / 0.9 = $100,000.
  check("net worth shown as $100,000", /net worth ~\$100,000/.test(nwLine), nwLine.trim());
}

console.log(failures === 0 ? "\nAll dynamic-context checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

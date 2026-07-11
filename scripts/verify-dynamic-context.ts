// Unit test for the chat's portfolio context builder (pure, no I/O).
// Run:  npx tsx scripts/verify-dynamic-context.ts
//
// Guards the net-worth presentation bug: the context must hand the model the
// net worth ALREADY in the user's display currency, so the model never does FX
// on the headline figure (it was overstating net worth for EUR/GBP users by
// quoting the USD-equivalent as if it were euros).

import { buildDynamicContext } from "../src/lib/claude";
import type { Asset, Mutation } from "../src/lib/supabase";
import type { VerdictData } from "../src/lib/scenario/decision-verdict";

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

console.log("Decision journal — exits carry values, notes and cached look-backs:");
{
  // An exited trade: bought 8 Adyen in 2021, sold all 8 in 2023, plus a
  // routine top-up edit (units UP) that must NOT appear in the journal.
  const mutations = [
    {
      id: "m-sell", action: "remove", asset_name: "Adyen", symbol: "ADYEN.AS", asset_type: "stocks",
      currency: "EUR", before_units: 8, after_units: null, before_value: 7200, after_value: null,
      occurred_at: "2023-08-20", recorded_at: "2023-08-20T10:00:00Z",
      personal_context: "Sold Adyen into the summer collapse — fear, not analysis.",
    },
    {
      id: "m-topup", action: "edit", asset_name: "Savings", symbol: null, asset_type: "cash",
      currency: "EUR", before_units: 1, after_units: 2, before_value: 100, after_value: 200,
      occurred_at: "2023-01-01", recorded_at: "2023-01-01T10:00:00Z", personal_context: null,
    },
    {
      id: "m-buy", action: "add", asset_name: "Adyen", symbol: "ADYEN.AS", asset_type: "stocks",
      currency: "EUR", before_units: null, after_units: 8, before_value: null, after_value: 17600,
      occurred_at: "2021-10-12", recorded_at: "2021-10-12T10:00:00Z",
      personal_context: "Bought a rare European payments champion.",
    },
  ] as unknown as Mutation[];
  const verdicts: Record<string, VerdictData> = {
    "m-sell": {
      mode: "sell", kind: "missed", figure: 4120, currency: "EUR", lookbackLabel: "2 years on",
      assetName: "Adyen",
      detail: { units: 8, valueThen: 7200, valueNow: 11320, date: "2023-08-20" },
    },
  };
  const ctx = buildDynamicContext(assets, {}, mutations, "EUR", "Tester", usdRates, verdicts);
  check("journal block present", /DECISION JOURNAL/.test(ctx));
  check("sell line carries units and value at sale", /sold\/removed Adyen \(ADYEN\.AS\) — 8 units, EUR 7,200 at sale/.test(ctx));
  check("buy line carries purchase value", /bought\/added Adyen \(ADYEN\.AS\) — 8 units, value EUR 17,600/.test(ctx));
  check("the user's own note is quoted", /Their note: "Sold Adyen into the summer collapse/.test(ctx));
  check("cached look-back is spelled out with figures", /Look-back \(2 years on, computed\): holding on would have gained ~EUR 4,120/.test(ctx));
  check("routine top-up (units up) is NOT in the journal", !/Savings/.test(ctx.split("DECISION JOURNAL")[1] ?? ""));
  check("model told not to invent figures", /do NOT invent cost basis/.test(ctx));
}

console.log(failures === 0 ? "\nAll dynamic-context checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

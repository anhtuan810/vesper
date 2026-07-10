// Regression suite for the agent read tools' guardrail allowlists. No LLM call.
// Run:  npx tsx scripts/verify-agent-tool-figures.ts
//
// Invariant: every money/percent figure a read tool hands the model (forModel)
// must also be in that tool's `figures` allowlist. The narration guardrail
// rejects any money/percent token the model wasn't given, so a forModel figure
// missing from `figures` silently degrades the reply to "Here's what I found."
// the moment the model quotes it — which is exactly what happened when
// get_vitals exposed singleNameConcentration/mortgageLtv without allowlisting
// them (every "How diversified am I?" answer died).
//
// The check is structural (stringify forModel, extract money/percent tokens,
// demand each is allowlisted), so a future field added to forModel but not to
// `figures` fails here without anyone having to remember the rule.

import { executeAgentTool, type ToolContext } from "../src/lib/chat/agent-tools";
import { extractMonetaryNumbers, validateMonetaryNarration } from "../src/lib/narrate/guardrail";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

// Portfolio with every optional vitals figure present: multiple categories,
// a dominant single name (concentration), and a mortgaged property (LTV),
// plus a tradeable lot with units + buy_price so get_holdings emits cost
// basis, gain, and gain %.
const assets: Array<Record<string, unknown>> = [
  { id: "1", name: "Nvidia", type: "stocks", value: 50_000, currency: "EUR", symbol: "NVDA", units: 100, buy_price: 200, buy_date: "2023-01-15" },
  { id: "2", name: "VWCE", type: "etf", value: 20_000, currency: "EUR", symbol: "VWCE.DE", units: 150 },
  { id: "3", name: "Savings", type: "cash", value: 10_000, currency: "EUR" },
  { id: "4", name: "Bitcoin", type: "crypto", value: 5_000, currency: "EUR", symbol: "BTC", units: 0.08 },
  { id: "5", name: "Home", type: "real_estate", value: 400_000, currency: "EUR", mortgage_balance: 250_000 },
];

const ctx: ToolContext = {
  // The read tools under test never touch the database.
  supabase: null as never,
  userId: "verify-user",
  displayCurrency: "EUR",
  usdRates: { EUR: 0.9, GBP: 0.8 },
  currentAssets: assets,
  now: new Date("2026-07-10T12:00:00Z"),
};

const READ_TOOLS = ["get_net_worth", "get_holdings", "get_vitals"];

async function main() {
  for (const tool of READ_TOOLS) {
    console.log(`${tool} — every forModel money/percent figure is allowlisted:`);
    const outcome = await executeAgentTool(tool, {}, ctx);
    const figures = outcome.figures ?? [];
    const exposed = extractMonetaryNumbers(JSON.stringify(outcome.forModel));
    check("tool returned figures", figures.length > 0, `figures=${figures.length}`);
    check("tool exposed money/percent values to the model", exposed.length > 0, `exposed=${exposed.length}`);
    for (const token of exposed) {
      check(`"${token}" allowlisted`, validateMonetaryNarration(token, figures));
    }
  }

  // The concrete regression: a diversification narration quoting the concentration
  // figure get_vitals reports must pass the guardrail.
  console.log("get_vitals — narration quoting the concentration figure passes the guardrail:");
  const outcome = await executeAgentTool("get_vitals", {}, ctx);
  const fm = outcome.forModel as { singleNameConcentration: string | null; mortgageLtv: string | null };
  check("fixture produced a concentration figure", fm.singleNameConcentration != null, JSON.stringify(fm));
  check("fixture produced an LTV figure", fm.mortgageLtv != null, JSON.stringify(fm));
  const narration = `Your largest position is **Nvidia** at **${fm.singleNameConcentration}** of your investable book, with mortgage LTV at **${fm.mortgageLtv}**.`;
  check("narration passes", validateMonetaryNarration(narration, outcome.figures ?? []), narration);

  console.log(failures === 0 ? "\nAll agent-tool figure checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });

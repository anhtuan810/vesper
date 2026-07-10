// Golden eval for the deterministic scenario layer: the validation gate plus the
// resolvers, date resolver, and units/amount normalizer it composes. No API key —
// feeds structured intents through validateScenarioIntent and asserts the decision
// (ok vs clarify) and the normalized output. Exits non-zero on any mismatch.
//
// Run:  npx tsx scripts/verify-scenario-intent.ts

import { validateScenarioIntent, resolveBuyDate, type ScenarioGateResult } from "../src/lib/scenario/validate-intent";
import { resolveMarketSymbolLocal } from "../src/lib/scenario/resolve-market-symbol";
import type { AssetRef } from "../src/lib/scenario/resolve-asset";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}
const isOk = (r: ScenarioGateResult): r is { ok: Record<string, unknown> } => "ok" in r;
const isClarify = (r: ScenarioGateResult): r is { clarify: { question: string; options: string[] } } => "clarify" in r;

const ASSETS: AssetRef[] = [
  { id: "a1", name: "NVIDIA", type: "stocks", symbol: "NVDA" },
  { id: "a2", name: "Bitcoin", type: "crypto", symbol: "BTC" },
  { id: "a3", name: "Home", type: "real_estate", symbol: null },
  { id: "a4", name: "Savings", type: "cash", symbol: null },
];
const CTX = { displayCurrency: "EUR" as const, usdRates: { EUR: 0.9, GBP: 0.8 }, now: new Date("2026-06-03T00:00:00Z") };
const gate = (intent: Record<string, unknown>) => validateScenarioIntent(intent, ASSETS, CTX);

async function main() {
  // ── Date resolver (pure) ─────────────────────────────────────────────────
  console.log("Date resolver:");
  check("ISO passes through", resolveBuyDate("2021-06-01", CTX.now) === "2021-06-01");
  check('"5y" → five years ago', resolveBuyDate("5y", CTX.now) === "2021-06-03", resolveBuyDate("5y", CTX.now));
  check("null → default 5 years ago", resolveBuyDate(null, CTX.now) === "2021-06-03");
  check('bare year "2020" → Jan 1', resolveBuyDate("2020", CTX.now) === "2020-01-01");
  // Natural phrases must resolve (via parseAcquisitionMonth), not silently fall
  // to the 5-years-ago default — that computed scenarios for a date the user
  // never asked about.
  check('ISO month "2020-05" → May 2020', resolveBuyDate("2020-05", CTX.now) === "2020-05-01", resolveBuyDate("2020-05", CTX.now));
  check('"March 2020" → Mar 2020', resolveBuyDate("March 2020", CTX.now) === "2020-03-01", resolveBuyDate("March 2020", CTX.now));
  check('garbage still → default 5 years ago', resolveBuyDate("whenever", CTX.now) === "2021-06-03");

  // ── Symbol resolver (pure local) ─────────────────────────────────────────
  console.log("Symbol resolver (local):");
  const btc = resolveMarketSymbolLocal("BTC");
  check('"BTC" → BTC-USD', btc.kind === "resolved" && btc.symbol === "BTC-USD");
  const bitcoin = resolveMarketSymbolLocal("Bitcoin");
  check('"Bitcoin" → BTC-USD', bitcoin.kind === "resolved" && bitcoin.symbol === "BTC-USD");

  // ── hypothetical_buy: units vs amount ─────────────────────────────────────
  console.log("hypothetical_buy — units vs amount:");
  {
    const r = await gate({ kind: "hypothetical_buy", symbolHint: "BTC", units: 1, buyDateHint: "5y" });
    check('"1 BTC" → units = 1 (NOT amount €1)', isOk(r) && r.ok.units === 1 && r.ok.amount === null, isOk(r) ? JSON.stringify({ units: r.ok.units, amount: r.ok.amount }) : "clarify");
    check("resolves BTC → BTC-USD on the normalized intent", isOk(r) && (r.ok._resolved as { symbol?: string })?.symbol === "BTC-USD");
    check("date normalized to ISO", isOk(r) && r.ok.buyDateHint === "2021-06-03", isOk(r) ? String(r.ok.buyDateHint) : "");
  }
  {
    const r = await gate({ kind: "hypothetical_buy", symbolHint: "BTC", amount: 1, currency: "EUR" });
    check("amount €1 for a buy → clarify (likely units misread)", isClarify(r), isClarify(r) ? r.clarify.question : "ok");
  }
  {
    const r = await gate({ kind: "hypothetical_buy", symbolHint: "Nvidia", amount: 5000, currency: "EUR" });
    check("€5,000 in Nvidia → ok amount = 5000 EUR", isOk(r) && r.ok.amount === 5000 && r.ok.currency === "EUR");
  }
  {
    const r = await gate({ kind: "hypothetical_buy", symbolHint: "Apple" });
    check("no units/amount → default €10,000 in display currency", isOk(r) && r.ok.amount === 10_000 && r.ok.currency === "EUR" && r.ok._defaulted === true);
  }

  // ── Symbol resolution through the gate ────────────────────────────────────
  console.log("hypothetical_buy — symbol resolution:");
  {
    const r = await gate({ kind: "hypothetical_buy", symbolHint: "Google", amount: 5000, currency: "EUR" });
    check('ambiguous alias "Google" → clarify with options', isClarify(r) && r.clarify.options.length >= 2, isClarify(r) ? r.clarify.options.join("|") : "ok");
  }
  {
    const r = await gate({ kind: "hypothetical_buy", symbolHint: "qwzxptlmgibber", amount: 5000, currency: "EUR" });
    check("gibberish symbol → clarify (none, asks)", isClarify(r), isClarify(r) ? "clarify" : "ok");
  }

  // ── counterfactual (held look-back) ───────────────────────────────────────
  console.log("counterfactual:");
  {
    const r = await gate({ kind: "counterfactual", asset: "NVIDIA" });
    check("held tradeable NVIDIA → ok", isOk(r));
  }
  {
    const r = await gate({ kind: "counterfactual", asset: "Tesla" });
    check("not-held asset Tesla → clarify/decline", isClarify(r), isClarify(r) ? r.clarify.question : "ok");
  }
  {
    const r = await gate({ kind: "counterfactual", asset: "Home" });
    check("non-tradeable Home → clarify/decline", isClarify(r));
  }

  // ── present ──────────────────────────────────────────────────────────────
  console.log("present:");
  {
    const r = await gate({ kind: "present", modifications: [{ op: "sell", asset: "Unobtainium", amount: 1000 }] });
    check("unresolvable asset → clarify", isClarify(r), isClarify(r) ? r.clarify.question : "ok");
  }
  {
    const r = await gate({ kind: "present", modifications: [{ op: "sell", asset: "NVIDIA", amount: -5 }] });
    check("absurd/negative amount → clarify", isClarify(r));
  }
  {
    const r = await gate({ kind: "present", modifications: [{ op: "sell", asset: "NVIDIA", amount: 5000 }] });
    check("valid sell on a held asset → ok", isOk(r));
  }

  // ── future ───────────────────────────────────────────────────────────────
  console.log("future:");
  {
    const r = await gate({ kind: "future", mode: "trajectory", horizonYears: 10, contribution: { amount: 500, frequency: "monthly" } });
    check("sane trajectory → ok", isOk(r));
  }
  {
    const r = await gate({ kind: "future", mode: "trajectory", horizonYears: 500 });
    check("absurd horizon → clarify", isClarify(r));
  }
  {
    const r = await gate({ kind: "future", mode: "solve", target: 1_000_000, targetYear: 2040 });
    check("sane solve → ok", isOk(r));
  }
  {
    const r = await gate({ kind: "future", mode: "solve", target: 1_000_000, targetYear: 1990 });
    check("past target year → clarify", isClarify(r));
  }

  // ── portfolio_change (the unified kind) ───────────────────────────────────
  console.log("portfolio_change:");
  {
    const r = await gate({ kind: "portfolio_change", modifications: [{ action: "buy", asset: "BTC", units: 2 }] });
    check('"buy 2 BTC" (units) → ok', isOk(r), isClarify(r) ? r.clarify.question : "ok");
  }
  {
    const r = await gate({ kind: "portfolio_change", modifications: [{ action: "buy", asset: "BTC", amount: 1, currency: "EUR" }] });
    check("buy with €1 → clarify (likely units)", isClarify(r), isClarify(r) ? r.clarify.question : "ok");
  }
  {
    const r = await gate({ kind: "portfolio_change", modifications: [{ action: "shock", asset: "markets", pct: 30 }] });
    check('"market drops 30%" → ok', isOk(r));
  }
  {
    const r = await gate({ kind: "portfolio_change", modifications: [{ action: "shock", asset: "markets", pct: 500 }] });
    check("absurd shock pct → clarify", isClarify(r));
  }
  {
    const r = await gate({ kind: "portfolio_change", modifications: [{ action: "sell", asset: "Tesla", units: 1 }] });
    check("sell a not-held position → clarify", isClarify(r), isClarify(r) ? r.clarify.question : "ok");
  }
  {
    const r = await gate({ kind: "portfolio_change", modifications: [{ action: "pay_mortgage", amount: 50000 }] });
    check("pay down the mortgage → ok", isOk(r));
  }

  console.log(failures === 0 ? "\nAll scenario-intent gate checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();

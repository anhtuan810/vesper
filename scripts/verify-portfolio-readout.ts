// Unit tests for the whole-portfolio before->after readout (pure; reuses the engine
// + the Vitals modules). Asserts net worth, allocation, concentration, and the
// applicable-only contextual-vital selection.
// Run:  npx tsx scripts/verify-portfolio-readout.ts

import { computePortfolioChange } from "../src/lib/scenario/portfolio-readout";
import type { Modification } from "../src/lib/scenario/engine";
import type { Asset } from "../src/lib/supabase";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}
const approx = (a: number, b: number, eps = 1e-4) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
const A = (o: Partial<Asset> & { id: string; name: string; type: string; value: number; currency: string }) => o as unknown as Asset;

const RATES = { EUR: 0.9 };
const USER = { country: null };
const allocPct = (r: { allocationByCategory: Array<{ category: string; pct: number }> }, cat: string) =>
  r.allocationByCategory.find((x) => x.category === cat)?.pct ?? 0;

// ── BTC buy: a big crypto add → concentration + drawdown; leverage/liquidity suppressed.
console.log("Buy crypto (no property):");
{
  const assets: Asset[] = [
    A({ id: "c", name: "Savings", type: "cash", value: 20_000, currency: "EUR" }),
    A({ id: "s", name: "Apple", type: "stocks", value: 80_000, currency: "EUR" }),
  ];
  const mods: Modification[] = [{ kind: "addByValue", name: "Bitcoin", type: "crypto", currency: "EUR", nativeValue: 100_000 }];
  const r = computePortfolioChange(assets, mods, RATES, USER);

  check("net worth before = 100k EUR in USD", approx(r.current.netWorthUsd, 100_000 / 0.9), `${r.current.netWorthUsd.toFixed(2)}`);
  check("net worth after = 200k EUR in USD", approx(r.scenario.netWorthUsd, 200_000 / 0.9), `${r.scenario.netWorthUsd.toFixed(2)}`);
  check("concentration 80% -> 50%", approx(r.current.topSingleNameConcentrationPct!, 80) && approx(r.scenario.topSingleNameConcentrationPct!, 50), `${r.current.topSingleNameConcentrationPct?.toFixed(1)} -> ${r.scenario.topSingleNameConcentrationPct?.toFixed(1)}`);
  check("crypto allocation appears after (0% -> 50%)", approx(allocPct(r.current, "crypto"), 0) && approx(allocPct(r.scenario, "crypto"), 50));
  const keys = r.contextualVitals.map((v) => v.key);
  check("contextual vitals = [drawdown] only", keys.length === 1 && keys[0] === "drawdown", keys.join(", ") || "none");
  const dd = r.contextualVitals.find((v) => v.key === "drawdown")!;
  check("drawdown 24% -> 37%", approx(dd.before, 24) && approx(dd.after, 37), `${dd.before.toFixed(1)} -> ${dd.after.toFixed(1)}`);
}

// ── Mortgage paydown from cash → leverage + liquidity; drawdown suppressed.
console.log("Pay down the mortgage from cash:");
{
  const assets: Asset[] = [
    A({ id: "h", name: "Home", type: "real_estate", value: 500_000, currency: "EUR", mortgage_balance: 300_000 }),
    A({ id: "c", name: "Savings", type: "cash", value: 100_000, currency: "EUR" }),
  ];
  const mods: Modification[] = [
    { kind: "payDownMortgage", assetId: "h", amount: 50_000 },
    { kind: "setValue", assetId: "c", nativeValue: 50_000 },
  ];
  const r = computePortfolioChange(assets, mods, RATES, USER);

  check("net worth ~unchanged (cash -> equity)", approx(r.current.netWorthUsd, r.scenario.netWorthUsd), `${r.current.netWorthUsd.toFixed(0)} vs ${r.scenario.netWorthUsd.toFixed(0)}`);
  const keys = new Set(r.contextualVitals.map((v) => v.key));
  check("contextual vitals = {leverage, liquidity}", r.contextualVitals.length === 2 && keys.has("leverage") && keys.has("liquidity"), [...keys].join(", "));
  check("drawdown suppressed (immaterial)", !keys.has("drawdown"));
  const lev = r.contextualVitals.find((v) => v.key === "leverage")!;
  check("leverage 60% -> 50%", approx(lev.before, 60) && approx(lev.after, 50), `${lev.before.toFixed(1)} -> ${lev.after.toFixed(1)}`);
  const liq = r.contextualVitals.find((v) => v.key === "liquidity")!;
  check("liquidity 33.3% -> 16.7%", approx(liq.before, 100 / 3) && approx(liq.after, 50_000 / 3000), `${liq.before.toFixed(1)} -> ${liq.after.toFixed(1)}`);
}

console.log(failures === 0 ? "\nAll portfolio-readout checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

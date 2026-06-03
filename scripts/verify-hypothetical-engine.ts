// Unit tests for the hypothetical-acquisition engine (pure, no I/O).
// Run:  npx tsx scripts/verify-hypothetical-engine.ts

import { hypotheticalBuyGrowth } from "../src/lib/scenario/hypothetical";
import type { PricePoint, FxByDate } from "../src/lib/scenario/counterfactual";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}
const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

// ── Flat FX (USD), 4× growth ────────────────────────────────────────────────
console.log("Hypothetical buy — $10k at $100 → $400 (USD, flat FX):");
{
  const prices: PricePoint[] = [
    { date: "2020-01-01", price: 100, currency: "USD" },
    { date: "2022-01-01", price: 200, currency: "USD" },
    { date: "2024-01-01", price: 400, currency: "USD" },
  ];
  const r = hypotheticalBuyGrowth(10_000, "2020-01-01", prices, {});
  check("value today = amount × priceToday/priceAtBuy", approx(r.valueTodayUsd, 40_000), `${r.valueTodayUsd}`);
  check("gain = value today − amount", approx(r.gainUsd, 30_000), `${r.gainUsd}`);
  check("multiple = value today / amount", approx(r.multiple, 4), `${r.multiple}`);
  check("series starts at the buy date with value ≈ amount", r.series[0]?.date === "2020-01-01" && approx(r.series[0].valueUsd, 10_000), `${r.series[0]?.date}=${r.series[0]?.valueUsd}`);
  check("series spans all closes on/after buy", r.series.length === 3, `len=${r.series.length}`);
}

// ── Nothing before the buy date ─────────────────────────────────────────────
console.log("Hypothetical buy — nothing before the buy date:");
{
  const prices: PricePoint[] = [
    { date: "2018-01-01", price: 50, currency: "USD" },  // predates the buy → excluded
    { date: "2020-01-01", price: 100, currency: "USD" },
    { date: "2024-01-01", price: 300, currency: "USD" },
  ];
  const r = hypotheticalBuyGrowth(10_000, "2020-01-01", prices, {});
  check("earliest series point is the buy date (pre-buy close dropped)", r.series[0]?.date === "2020-01-01", `${r.series[0]?.date}`);
  check("no point predates the buy date", r.series.every((p) => p.date >= "2020-01-01"), `len=${r.series.length}`);
  check("multiple = 3", approx(r.multiple, 3), `${r.multiple}`);
}

// ── Per-date FX applied when FX varies ──────────────────────────────────────
console.log("Hypothetical buy — €-priced, FX moves 1.0 → 0.5 (quote per USD):");
{
  const prices: PricePoint[] = [
    { date: "2021-01-01", price: 100, currency: "EUR" },
    { date: "2024-01-01", price: 100, currency: "EUR" }, // flat in EUR…
  ];
  // 1 USD = 1.0 EUR at buy (€100 = $100); 1 USD = 0.5 EUR today (€100 = $200).
  const fx: FxByDate = {
    "2021-01-01": { EUR: 1.0 },
    "2024-01-01": { EUR: 0.5 },
  };
  const r = hypotheticalBuyGrowth(10_000, "2021-01-01", prices, fx);
  check("buy USD price uses buy-date FX (€100 → $100, 100 units)", approx(r.series[0].valueUsd, 10_000), `${r.series[0].valueUsd}`);
  check("today USD value uses today FX (€100 → $200 ⇒ $20k)", approx(r.valueTodayUsd, 20_000), `${r.valueTodayUsd}`);
  check("multiple = 2 (FX-driven, price flat in EUR)", approx(r.multiple, 2), `${r.multiple}`);
}

// ── Date clamped to earliest available data ─────────────────────────────────
console.log("Hypothetical buy — requested date predates the series (clamp):");
{
  const prices: PricePoint[] = [
    { date: "2015-08-01", price: 250, currency: "USD" },
    { date: "2024-01-01", price: 1000, currency: "USD" },
  ];
  const r = hypotheticalBuyGrowth(10_000, "2010-01-01", prices, {});
  check("buy date clamped to earliest data", r.buyDateUsed === "2015-08-01", `${r.buyDateUsed}`);
  check("multiple = 4 from earliest available close", approx(r.multiple, 4), `${r.multiple}`);
}

console.log(failures === 0 ? "\nAll hypothetical-engine checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

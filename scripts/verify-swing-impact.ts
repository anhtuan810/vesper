// Unit tests for market-swing day-change attribution (pure, no I/O).
// Run:  npx tsx scripts/verify-swing-impact.ts
//
// Locks the confirmed bug where a swing valued a position with its END-OF-DAY
// units on both the swing day and the prior day: a dip-buy showed as a loss the
// user never took, and a same-day sale was dropped. The fix feeds the units held
// as of the prior day P; computeSwingDayChange does pure price attribution at
// that fixed count. These assertions cover the math and the two boundary cases.

import { computeSwingDayChange, type SwingHolding } from "../src/lib/diary-market-moves";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;

const D = "2026-03-10";
const P = "2026-03-09";
// MSFT fell 190 → 184 (−3.16%) over P→D; NVDA fell 120 → 110.
const histMap = new Map<string, Array<{ date: string; price: number; currency: string }>>([
  ["MSFT", [{ date: P, price: 190, currency: "USD" }, { date: D, price: 184, currency: "USD" }]],
  ["NVDA", [{ date: P, price: 120, currency: "USD" }, { date: D, price: 110, currency: "USD" }]],
]);
const idDisplay = (amount: number) => amount; // same-currency identity

console.log("A position held across the move is attributed the price move:");
{
  const holdings: SwingHolding[] = [{ symbol: "MSFT", label: "Microsoft", units: 10, histKey: "MSFT" }];
  const { total, movers } = computeSwingDayChange(D, P, holdings, histMap, idDisplay);
  check("total = 10 × (184 − 190) = −60", near(total, -60), String(total));
  check("one mover, MSFT, impact −60", movers.length === 1 && movers[0].symbol === "MSFT" && near(movers[0].impact, -60), JSON.stringify(movers));
  check("mover pct ≈ −3.16%", near(movers[0].pct, ((184 - 190) / 190) * 100), String(movers[0].pct));
}

console.log("A dip-buy (0 units held as of P) contributes nothing — no phantom loss:");
{
  // This is what the caller now passes for a position BOUGHT on D: unitsOf(P) = 0.
  const holdings: SwingHolding[] = [{ symbol: "MSFT", label: "Microsoft", units: 0, histKey: "MSFT" }];
  const { total, movers } = computeSwingDayChange(D, P, holdings, histMap, idDisplay);
  check("total is 0", total === 0, String(total));
  check("no movers", movers.length === 0);
}

console.log("Movers are sorted by absolute impact, largest first:");
{
  const holdings: SwingHolding[] = [
    { symbol: "MSFT", label: "Microsoft", units: 10, histKey: "MSFT" }, // −60
    { symbol: "NVDA", label: "Nvidia", units: 30, histKey: "NVDA" },    // 30 × (110−120) = −300
  ];
  const { total, movers } = computeSwingDayChange(D, P, holdings, histMap, idDisplay);
  check("total = −360", near(total, -360), String(total));
  check("NVDA (−300) sorts before MSFT (−60)", movers[0].symbol === "NVDA" && movers[1].symbol === "MSFT", movers.map((m) => m.symbol).join(","));
}

console.log("FX is applied per side via toDisplay:");
{
  // Convert USD→EUR at 0.9 on both days (rate flat) — pure price move, scaled.
  const eur = (amount: number, cur: string) => (cur === "USD" ? amount * 0.9 : amount);
  const holdings: SwingHolding[] = [{ symbol: "MSFT", label: "Microsoft", units: 10, histKey: "MSFT" }];
  const { total } = computeSwingDayChange(D, P, holdings, histMap, eur);
  check("−60 USD × 0.9 = −54 EUR", near(total, -54), String(total));
}

console.log(failures === 0 ? "\nAll swing-impact checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

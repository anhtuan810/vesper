// Unit tests for ASSET-swing detection + qualification (pure, no I/O).
// Run:  npx tsx scripts/verify-asset-swings.ts
//
// Covers the new "asset swing" kind — a held asset's OWN big single-day move:
//   • detectAssetSwings: threshold, the units-held gate (no swing before the buy
//     date), and per-date dedup to the largest |move| (the headline).
//   • the qualify step's headline reorder (movers[0] must be the named asset) and
//     the tiny-position floor, exercised against the REAL computeSwingDayChange.

import {
  detectAssetSwings,
  computeSwingDayChange,
  type AssetMoveSeries,
  type SwingHolding,
} from "../src/lib/diary-market-moves";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;

// ── detectAssetSwings ────────────────────────────────────────────────────────
console.log("A ≥5% own move on a held day is detected; a sub-5% day is not:");
{
  const nvda: AssetMoveSeries = {
    symbol: "NVDA", label: "NVIDIA",
    series: [
      { date: "2024-02-20", price: 100 },
      { date: "2024-02-21", price: 108 }, // +8% → swing
      { date: "2024-02-22", price: 110 }, // +1.85% → below threshold
    ],
    unitsAt: () => 30, // held throughout
  };
  const out = detectAssetSwings([nvda], 5);
  check("one swing, on the +8% day", out.size === 1 && out.has("2024-02-21"));
  const c = out.get("2024-02-21")!;
  check("headline is NVDA with prior = the day before", c.symbol === "NVDA" && c.prior === "2024-02-20");
  check("pct ≈ +8%", near(c.pct, 8), String(c.pct));
  check("the +1.85% day is not a swing", !out.has("2024-02-22"));
}

console.log("No swing on a date the asset was NOT held (before the buy):");
{
  const bought = "2024-05-10";
  const a: AssetMoveSeries = {
    symbol: "MU", label: "Micron",
    series: [
      { date: "2024-05-08", price: 100 },
      { date: "2024-05-09", price: 112 }, // +12% but not yet held (units 0) → excluded
      { date: "2024-05-10", price: 112 }, // buy day, flat → not a swing
      { date: "2024-05-13", price: 127 }, // +13.4% and held → swing
    ],
    unitsAt: (d) => (d >= bought ? 30 : 0),
  };
  const out = detectAssetSwings([a], 5);
  check("pre-buy move excluded, held move kept", out.size === 1 && out.has("2024-05-13") && !out.has("2024-05-09"), [...out.keys()].join(","));
}

console.log("Per date, the largest |move| wins across assets (the headline):");
{
  const nvda: AssetMoveSeries = {
    symbol: "NVDA", label: "NVIDIA",
    series: [{ date: "2024-03-04", price: 100 }, { date: "2024-03-05", price: 106 }], // +6%
    unitsAt: () => 10,
  };
  const btc: AssetMoveSeries = {
    symbol: "BTC-EUR", label: "Bitcoin",
    series: [{ date: "2024-03-04", price: 100 }, { date: "2024-03-05", price: 91 }], // −9%
    unitsAt: () => 0.1,
  };
  const out = detectAssetSwings([nvda, btc], 5);
  check("same date → single candidate", out.size === 1 && out.has("2024-03-05"));
  check("BTC (−9%) beats NVDA (+6%) as headline", out.get("2024-03-05")!.symbol === "BTC-EUR", out.get("2024-03-05")!.symbol);
}

// ── qualify: headline reorder + floor (with the REAL computeSwingDayChange) ──
console.log("The named asset is reordered to movers[0] and passes/fails the floor:");
{
  const D = "2024-06-11", P = "2024-06-10";
  // NVDA is the swing (+9%) but a smaller absolute impact than a big MSFT position
  // that also moved that day — so without the reorder MSFT would be movers[0].
  const histMap = new Map<string, Array<{ date: string; price: number; currency: string }>>([
    ["NVDA", [{ date: P, price: 100, currency: "USD" }, { date: D, price: 109, currency: "USD" }]], // 30u × +9 = +270
    ["MSFT", [{ date: P, price: 400, currency: "USD" }, { date: D, price: 410, currency: "USD" }]], // 100u × +10 = +1000
  ]);
  const holdings: SwingHolding[] = [
    { symbol: "NVDA", label: "NVIDIA", units: 30, histKey: "NVDA" },
    { symbol: "MSFT", label: "Microsoft", units: 100, histKey: "MSFT" },
  ];
  const { total, tradeableValue, movers } = computeSwingDayChange(D, P, holdings, histMap, (amt) => amt);
  check("raw sort puts MSFT first (bigger |impact|)", movers[0].symbol === "MSFT");
  // Reorder so the headline (NVDA) leads — the qualify step in getDiaryMarketMoves.
  const hi = movers.findIndex((m) => m.symbol === "NVDA");
  const ordered = [movers[hi], ...movers.slice(0, hi), ...movers.slice(hi + 1)];
  check("after reorder, NVDA leads and its own impact ≈ +270", ordered[0].symbol === "NVDA" && near(ordered[0].impact, 270), String(ordered[0].impact));
  check("total across the book is unchanged (+1270)", near(total, 1270), String(total));

  // Floor = 0.3% of that day's tradeable value. NVDA's +270 clears it easily here…
  const floor = (tradeableValue * 0.3) / 100;
  check("headline impact clears the floor", Math.abs(ordered[0].impact) >= floor, `impact 270 vs floor ${floor.toFixed(1)}`);

  // …but a tiny 9% move on a €50 stake would not (kills tiny-position noise).
  const tinyHist = new Map([["TINY", [{ date: P, price: 100, currency: "USD" }, { date: D, price: 109, currency: "USD" }]]]);
  const tinyHoldings: SwingHolding[] = [
    { symbol: "TINY", label: "Tiny", units: 0.5, histKey: "TINY" },   // ~€54 → +€4.5
    { symbol: "MSFT", label: "Microsoft", units: 100, histKey: "MSFT" },
  ];
  tinyHist.set("MSFT", histMap.get("MSFT")!);
  const tiny = computeSwingDayChange(D, P, tinyHoldings, tinyHist, (amt) => amt);
  const tinyFloor = (tiny.tradeableValue * 0.3) / 100;
  const tinyOwn = tiny.movers.find((m) => m.symbol === "TINY")!.impact;
  check("a €54 stake's 9% move is below the floor (dropped)", Math.abs(tinyOwn) < tinyFloor, `impact ${tinyOwn.toFixed(2)} vs floor ${tinyFloor.toFixed(1)}`);
}

console.log(failures === 0 ? "\nAll asset-swing checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

// Unit tests for ASSET-swing detection + qualification (pure, no I/O).
// Run:  npx tsx scripts/verify-asset-swings.ts
//
// Covers the "asset swing" kind — a held asset's OWN big single-day move:
//   • detectAssetSwings: threshold, the units-held gate (no swing before the buy
//     date), the window bound (no swing before the lookback cutoff), and that it
//     returns ALL held movers per date (headline chosen by impact, not %).
//   • the headline-by-impact ranking (a big-% tiny position must not shadow a
//     large one), the qualify step's reorder (movers[0] must be the named asset)
//     and the tiny-position floor — all against the REAL computeSwingDayChange.

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
const NO_CUTOFF = "0000-01-01"; // low cutoff → nothing window-excluded

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
  const out = detectAssetSwings([nvda], NO_CUTOFF, 5);
  check("one swing date, on the +8% day", out.size === 1 && out.has("2024-02-21"));
  const c = out.get("2024-02-21")![0];
  check("candidate is NVDA with prior = the day before", c.symbol === "NVDA" && c.prior === "2024-02-20");
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
  const out = detectAssetSwings([a], NO_CUTOFF, 5);
  check("pre-buy move excluded, held move kept", out.size === 1 && out.has("2024-05-13") && !out.has("2024-05-09"), [...out.keys()].join(","));
}

console.log("A move before the lookback cutoff is excluded (window bound):");
{
  const a: AssetMoveSeries = {
    symbol: "AAPL", label: "Apple",
    series: [
      { date: "2024-01-04", price: 100 },
      { date: "2024-01-05", price: 110 }, // +10% but BEFORE the cutoff → excluded
      { date: "2024-06-10", price: 110 }, // flat vs prior in series → not a swing
      { date: "2024-06-11", price: 123 }, // +11.8% in-window → swing
    ],
    unitsAt: () => 10, // held throughout
  };
  const out = detectAssetSwings([a], "2024-06-01", 5);
  check("pre-cutoff move excluded, in-window kept", out.size === 1 && out.has("2024-06-11") && !out.has("2024-01-05"), [...out.keys()].join(","));
}

console.log("All held ≥threshold movers on a date are returned (NO %-dedup — headline is chosen by impact downstream):");
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
  const day = detectAssetSwings([nvda, btc], NO_CUTOFF, 5).get("2024-03-05") ?? [];
  check("both candidates kept for the shared date", day.length === 2, `len ${day.length}`);
  check("includes NVDA and BTC", day.some((c) => c.symbol === "NVDA") && day.some((c) => c.symbol === "BTC-EUR"), day.map((c) => c.symbol).join(","));
}

console.log("Headline is chosen by OWN impact, not %, so a big-% tiny position can't shadow a large one:");
{
  const D = "2024-07-11", P = "2024-07-10";
  const hist = new Map<string, Array<{ date: string; price: number; currency: string }>>([
    ["TINY", [{ date: P, price: 100, currency: "USD" }, { date: D, price: 112, currency: "USD" }]], // +12%
    ["NVDA", [{ date: P, price: 100, currency: "USD" }, { date: D, price: 108, currency: "USD" }]], // +8%
  ]);
  const own = (symbol: string, units: number) =>
    computeSwingDayChange(D, P, [{ symbol, label: symbol, units, histKey: symbol }], hist, (a) => a).movers[0]?.impact ?? 0;
  const tinyOwn = own("TINY", 0.4); // 0.4 × +12 = +4.8
  const nvdaOwn = own("NVDA", 60);  // 60  × +8  = +480
  check("TINY moved a bigger % (+12) but NVDA has the bigger own impact → NVDA is the headline",
    Math.abs(nvdaOwn) > Math.abs(tinyOwn), `nvda ${nvdaOwn} vs tiny ${tinyOwn}`);
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

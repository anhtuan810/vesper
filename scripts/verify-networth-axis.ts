// Guards the net-worth stacked-area chart's y-axis domain.
// Run:  npx tsx scripts/verify-networth-axis.ts
// Exits non-zero on any mismatch. No framework, no I/O.
//
// The chart stacks four asset-class bands from a 0 baseline up to each point's
// net-worth total, so the top of the stack coincides with the net-worth line.
// For that composition to be visible the y-axis MUST include 0. A regression
// fitted the floor to the data minimum (a zoom-to-band line-chart trick), which
// pushed every band below that floor — Property (the largest holding), Markets,
// and most of Crypto — beneath the SVG viewBox, leaving only the top sliver of
// Reserves smeared across the chart. This script reproduces that clipping with
// the OLD floor, then proves the shipped 0-anchored domain keeps every band in
// view.

import { computeYAxisDomain, computeNiceLevels, timeFractions, nearestIndexForFraction, isEffectivelySingleBand } from "../src/lib/networth-axis";
import { categoryBreakdown, STACK_ORDER, type Category } from "../src/lib/categories";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

// ── Chart geometry, mirroring NetWorthChart.tsx ──────────────────────────────
const H = 140, PAD_TOP = 6, PAD_BOTTOM = 8;
const DRAW_H = H - PAD_TOP - PAD_BOTTOM;
function projectY(v: number, yMin: number, yMax: number): number {
  const yRange = Math.max(yMax - yMin, 1);
  return PAD_TOP + DRAW_H - ((v - yMin) / yRange) * DRAW_H;
}
// A SVG y outside [0, H] is clipped by the viewBox. A band [lower, upper]
// (upper > lower in value ⇒ smaller y) is fully below the chart when even its
// top edge sits past the bottom: projectY(upper) > H.
const clippedBelow = (upper: number, yMin: number, yMax: number) => projectY(upper, yMin, yMax) > H + 1e-6;

// The OLD, buggy domain: floor fitted to the data minimum (only clamped to >= 0
// near zero, never anchored AT 0). Kept here purely to demonstrate the bug.
function oldComputeYAxisDomain(dataMin: number, dataMax: number) {
  const mid = (dataMin + dataMax) / 2;
  const span = dataMax - dataMin;
  const minSpan = Math.max(Math.abs(mid) * 0.04, 1);
  const effMin = span < minSpan ? mid - minSpan / 2 : dataMin;
  const effMax = span < minSpan ? mid + minSpan / 2 : dataMax;
  const pad = (effMax - effMin) * 0.08;
  const rawMin = effMin - pad;
  return computeNiceLevels(dataMin >= 0 ? Math.max(0, rawMin) : rawMin, effMax + pad);
}

// Stack a point's category bands from a 0 baseline (mirrors the component).
function stackBounds(total: number, props: Record<Category, number>) {
  const out = {} as Record<Category, { lower: number; upper: number }>;
  let cum = 0;
  for (const c of STACK_ORDER) {
    const lower = cum;
    cum += total * props[c];
    out[c] = { lower, upper: cum };
  }
  return out;
}

// ── The exact figures from the reported screenshot ───────────────────────────
// Scrub point composition (sums to the €389,000 the hero showed).
const breakdown = { real_estate: 235_734, stocks: 80_134, crypto: 19_061, cash: 54_071 };
const cat = categoryBreakdown(breakdown);
const total = STACK_ORDER.reduce((s, c) => s + cat[c], 0);
const props = STACK_ORDER.reduce((m, c) => ({ ...m, [c]: cat[c] / total }), {} as Record<Category, number>);

console.log("Net-worth chart y-axis domain:\n");

console.log("Invariant — the stack's segments sum to the net-worth line:");
check("breakdown sums to €389,000", Math.round(total) === 389_000, `got ${Math.round(total)}`);
check(
  "category proportions sum to 1 (top of stack === total === line)",
  Math.abs(STACK_ORDER.reduce((s, c) => s + props[c], 0) - 1) < 1e-9,
);

// An "All"-range window whose totals (≈€370K–€460K) reproduce the screenshot's
// 350K/400K/450K/500K axis under the OLD domain.
const dataMin = 370_000, dataMax = 460_000;
const bounds = stackBounds(total, props);

console.log("\nOLD domain (data-fitted floor) — reproduces the bug:");
const oldD = oldComputeYAxisDomain(dataMin, dataMax);
check("floor lifted well above 0", oldD.niceMin > 0, `niceMin=${oldD.niceMin}`);
check(
  "Property band is clipped below the viewBox (the missing bottom part)",
  clippedBelow(bounds.property.upper, oldD.niceMin, oldD.niceMax),
  `top of Property → y=${projectY(bounds.property.upper, oldD.niceMin, oldD.niceMax).toFixed(1)} (chart height ${H})`,
);
check("Markets band is clipped too", clippedBelow(bounds.markets.upper, oldD.niceMin, oldD.niceMax));
const oldVisible = STACK_ORDER.filter((c) => !clippedBelow(bounds[c].upper, oldD.niceMin, oldD.niceMax));
check("only the top (Reserves) band survives", oldVisible.length === 1 && oldVisible[0] === "reserves",
  `visible: ${oldVisible.join(", ")}`);

console.log("\nNEW domain (0-anchored) — the fix:");
const d = computeYAxisDomain(dataMin, dataMax);
check("floor anchored at 0", d.niceMin === 0, `niceMin=${d.niceMin}`);
check("peak leaves headroom above the data", d.niceMax > dataMax, `niceMax=${d.niceMax}`);
check("0 baseline is inside the visible window", projectY(0, d.niceMin, d.niceMax) <= H + 1e-6);
for (const c of STACK_ORDER) {
  const visible = !clippedBelow(bounds[c].upper, d.niceMin, d.niceMax)
    && projectY(bounds[c].lower, d.niceMin, d.niceMax) <= H + 1e-6;
  check(`${c} band is visible`, visible,
    `y ${projectY(bounds[c].upper, d.niceMin, d.niceMax).toFixed(1)}..${projectY(bounds[c].lower, d.niceMin, d.niceMax).toFixed(1)}`);
}

console.log("\nProperty — anchoring at 0 holds across many non-negative windows:");
let allAnchored = true, allCover = true;
for (const lo of [0, 1_000, 54_071, 370_000, 2_870_000]) {
  for (const hi of [lo + 1, lo + 1_000, lo + 250_000, lo * 2 + 1]) {
    const dom = computeYAxisDomain(lo, hi);
    if (dom.niceMin !== 0) allAnchored = false;       // floor always 0
    if (dom.niceMax < hi) allCover = false;           // full stack always fits
  }
}
check("niceMin === 0 for every non-negative window", allAnchored);
check("niceMax always covers the peak (whole stack fits)", allCover);

console.log("\nGenuinely negative net worth still includes the 0 baseline:");
const neg = computeYAxisDomain(-40_000, 120_000);
check("0 within [niceMin, niceMax]", neg.niceMin <= 0 && neg.niceMax >= 0,
  `[${neg.niceMin}, ${neg.niceMax}]`);

// ── Single-band detection (zoom vs 0-anchor) ─────────────────────────────────
//
// A net worth made of ONE asset class has no lower bands to protect, so the
// chart zooms to the data band like the Liquid line instead of squashing the
// trajectory against a 0 floor (the reported "flat line"). A genuine multi-band
// stack keeps the 0-anchor tested above.
console.log("\nSingle-band detection (zoom vs 0-anchor):");
const marketsOnly = [110_000, 132_000, 121_000, 145_000].map((v) => ({
  property: 0, markets: v, crypto: 0, reserves: 0,
}));
check("all-one-class portfolio → single band (zoom the line)", isEffectivelySingleBand(marketsOnly));

// The €389K screenshot breakdown (property/markets/crypto/reserves) — a real
// multi-band stack must NOT zoom (that's the clip-collapse bug above).
check("multi-band portfolio → NOT single band (keep 0-anchor)",
  !isEffectivelySingleBand([cat]));

// Empty / pre-breakdown rows (all-zero) are ignored, not miscounted as a
// second "reserves" band — otherwise an all-markets account with old history
// would be forced back to the flat 0-anchor.
check("empty-breakdown points are ignored, not counted",
  isEffectivelySingleBand([
    { property: 0, markets: 0, crypto: 0, reserves: 0 },
    { property: 0, markets: 90_000, crypto: 0, reserves: 0 },
    { property: 0, markets: 95_000, crypto: 0, reserves: 0 },
  ]));

// A sub-1% sliver is dust — it shouldn't defeat the zoom.
check("a <1% sliver still reads as single band",
  isEffectivelySingleBand([{ property: 0, markets: 100_000, crypto: 0, reserves: 500 }]));

// Two genuinely present bands (≥1% each) keep the composition (0-anchor).
check("two real bands (≥1% each) → NOT single band",
  !isEffectivelySingleBand([{ property: 0, markets: 90_000, crypto: 0, reserves: 10_000 }]));

// A window that STARTS single-class then gains a second class (e.g. bought a
// house) is multi-band — the new band must stay visible.
check("becomes multi-band mid-window → NOT single band",
  !isEffectivelySingleBand([
    { property: 0, markets: 100_000, crypto: 0, reserves: 0 },
    { property: 200_000, markets: 100_000, crypto: 0, reserves: 0 },
  ]));

check("no data → not single band (falls back to default 0-anchor)",
  !isEffectivelySingleBand([]));

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
// ── Time-true x positions (timeFractions / nearestIndexForFraction) ─────────
console.log("\nTime-true x positions:");
{
  // Mixed cadence: 5 monthly points then a daily point one day after the last
  // month — under index spacing that day got a full segment (1/5 of the chart);
  // time-true gives it its real sliver.
  const dates = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-05-02"];
  const fr = timeFractions(dates);
  check("starts at 0 and ends at 1", fr[0] === 0 && fr[fr.length - 1] === 1);
  check("monotone non-decreasing", fr.every((f, i) => i === 0 || f >= fr[i - 1]));
  const monthWidth = fr[1] - fr[0];
  const dayWidth = fr[5] - fr[4];
  check("a day is ~1/30 of a month, not a full segment", dayWidth < monthWidth / 20, `day=${dayWidth.toFixed(4)} month=${monthWidth.toFixed(4)}`);

  // Even monthly spacing ≈ even fractions (months differ by ±3 days).
  const even = timeFractions(["2026-01-01", "2026-02-01", "2026-03-01"]);
  check("evenish cadence stays evenish", Math.abs(even[1] - 0.5) < 0.03, String(even[1]));

  // Intraday ISO datetimes parse (Liquid · 1D series).
  const intra = timeFractions(["2026-07-01T13:30:00.000Z", "2026-07-01T15:30:00.000Z", "2026-07-01T20:00:00.000Z"]);
  check("intraday datetimes: monotone 0..1", intra[0] === 0 && intra[2] === 1 && intra[1] > 0 && intra[1] < 1);

  // Degenerate spans fall back to index spacing (never divide by zero).
  const dup = timeFractions(["2026-01-01", "2026-01-01", "2026-01-01"]);
  check("all-same-date falls back to index spacing", dup[0] === 0 && dup[1] === 0.5 && dup[2] === 1);
  const bad = timeFractions(["nonsense", "alsonot", "dates!!"]);
  check("unparseable dates fall back to index spacing", bad[0] === 0 && bad[1] === 0.5 && bad[2] === 1);

  // Scrub inverse: nearest point by position, clamped at the ends.
  check("inverse: fraction at a point returns it", nearestIndexForFraction(fr, fr[3]) === 3);
  check("inverse: midpoint resolves to nearer point", nearestIndexForFraction([0, 0.8, 1], 0.35) === 0);
  check("inverse: 0 and 1 clamp to the ends", nearestIndexForFraction(fr, 0) === 0 && nearestIndexForFraction(fr, 1) === fr.length - 1);
  // The daily sliver is still reachable: a tap at the far right edge between
  // the last two points snaps to whichever is closer.
  check("inverse: near-right tap hits the last point", nearestIndexForFraction(fr, 0.999) === 5);
}

process.exit(failures === 0 ? 0 : 1);

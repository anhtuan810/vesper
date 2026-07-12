// Guards the Overview chart's journal-marker de-clustering (thinMarkerDots).
// Run:  npx tsx scripts/verify-marker-declutter.ts
// Exits non-zero on any mismatch. No framework, no I/O.
//
// The chart plots one dot per journal entry at its date's x. On the default
// "All" range (the whole multi-year history) a run of RECENT market swings all
// lands inside the last few weeks — i.e. the last ~5% of the width — so the dots
// collapse onto the same handful of pixels at the right edge and pile into one
// unreadable, untappable smudge. That is exactly why market events looked
// "missing" on the graph while the journal listed them all. thinMarkerDots
// thins overlapping dots to a minimum on-screen gap so each stays legible.
//
// This reproduces the reported case (8 recent market swings + spread decisions
// on a 2-year "All" view) and pins the de-cluster contract.

import { thinMarkerDots, timeFractions } from "../src/lib/networth-axis";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

type Dot = { id: string; x: number; kind: "you" | "market" };
const MIN_GAP = 7; // mirrors MARKER_MIN_GAP in NetWorthChart.tsx
const minSpacingOK = (dots: Dot[]) =>
  dots.every((a, i) => dots.every((b, j) => i === j || Math.abs(a.x - b.x) >= MIN_GAP));

console.log("Journal-marker de-clustering (thinMarkerDots):\n");

// ── Reproduce the screenshot: 2-year All view, W=340px ───────────────────────
// Build time-true x for the entry dates the same way the chart does, then place
// each marker at its date's x. The 8 market swings are all within the last ~6
// weeks; the 3 decisions are spread across the two years.
const W = 340;
const first = "2024-07-01";
const last = "2026-07-12"; // today (the live tip)
const decisions = ["2024-07-01", "2025-03-10", "2026-02-20"];
// newest-first, matching the API's sort and how PortfolioTab lists market markers
const swings = ["2026-07-01", "2026-06-29", "2026-06-25", "2026-06-15", "2026-06-11", "2026-06-05", "2026-06-05", "2026-06-01"];
const xOf = (date: string) => {
  const fr = timeFractions([first, date, last]);
  return fr[1] * W;
};
const rawDots: Dot[] = [
  ...decisions.map((d, i) => ({ id: `you-${i}`, x: xOf(d), kind: "you" as const })),
  ...swings.map((d, i) => ({ id: `mv-${i}`, x: xOf(d), kind: "market" as const })),
];

console.log("Reported case — 8 recent market swings crush into the right edge:");
const marketXs = rawDots.filter((d) => d.kind === "market").map((d) => d.x);
const marketSpan = Math.max(...marketXs) - Math.min(...marketXs);
check("raw: every market dot sits in the right ~6% of the width", marketXs.every((x) => x > W * 0.94),
  `xs ${marketXs.map((x) => x.toFixed(0)).join(",")} of ${W}`);
check("raw: they overlap (span < the min gap × their count)", marketSpan < MIN_GAP * marketXs.length,
  `span ${marketSpan.toFixed(1)}px across ${marketXs.length} dots`);
check("raw: at least one pair is fully coincident (same-date swings)", !minSpacingOK(rawDots));

const thinned = thinMarkerDots(rawDots, null, MIN_GAP);
console.log("\nAfter thinning:");
check("every kept dot honours the minimum gap (no smudge)", minSpacingOK(thinned));
check("all three decisions survive (spread out, never dropped for a swing)",
  decisions.every((_, i) => thinned.some((d) => d.id === `you-${i}`)),
  `kept: ${thinned.filter((d) => d.kind === "you").map((d) => d.id).join(",")}`);
check("at least one market swing is now shown on the graph",
  thinned.some((d) => d.kind === "market"),
  `market kept: ${thinned.filter((d) => d.kind === "market").length}`);
check("output preserves input order (stable render/z-stack)",
  thinned.every((d, i) => i === 0 || rawDots.indexOf(d) > rawDots.indexOf(thinned[i - 1])));

// ── Priority: the selected entry is never thinned away ────────────────────────
console.log("\nSelected entry is always kept (its guide/halo must render):");
// An older market swing that would normally lose to a decision beside it.
const clash: Dot[] = [
  { id: "you-a", x: 100, kind: "you" },
  { id: "mv-a", x: 103, kind: "market" }, // within the gap of you-a → normally dropped
];
check("without selection, the decision wins the contested slot",
  thinMarkerDots(clash, null, MIN_GAP).some((d) => d.id === "you-a") &&
  !thinMarkerDots(clash, null, MIN_GAP).some((d) => d.id === "mv-a"));
const selKept = thinMarkerDots(clash, "mv-a", MIN_GAP);
check("selecting the swing keeps it (guide/halo can anchor)", selKept.some((d) => d.id === "mv-a"),
  `kept: ${selKept.map((d) => d.id).join(",")}`);

// ── Spread-out entries (a shorter range) are untouched ───────────────────────
console.log("\nWell-separated dots (a 1M/3M range) pass through unchanged:");
const spread: Dot[] = [0, 40, 90, 150, 220, 300].map((x, i) => ({ id: `m-${i}`, x, kind: "market" }));
const spreadOut = thinMarkerDots(spread, null, MIN_GAP);
check("nothing is dropped when everything already clears the gap", spreadOut.length === spread.length);

// ── Degenerate inputs ────────────────────────────────────────────────────────
console.log("\nEdge cases:");
check("empty stays empty", thinMarkerDots([], null, MIN_GAP).length === 0);
check("a single dot is returned as-is", thinMarkerDots([{ id: "x", x: 5, kind: "market" }], null, MIN_GAP).length === 1);

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);

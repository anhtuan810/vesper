// Y-axis math for the net-worth stacked-area chart (NetWorthChart).
//
// Kept in its own pure module — no React, no DOM — so the geometry can be
// exercised in isolation by scripts/verify-networth-axis.ts. The chart's
// SVG/projection code stays in the component; only the domain/label math lives
// here, because that math is where the stacked-area invariant is enforced.

export interface NiceLevels {
  niceMin: number;
  niceMax: number;
  labels: number[];
}

export function computeNiceLevels(dataMin: number, dataMax: number): NiceLevels {
  const range = dataMax - dataMin;
  if (range === 0) {
    const step = Math.max(Math.abs(dataMax) * 0.1, 1);
    return { niceMin: dataMax - step, niceMax: dataMax + step, labels: [dataMax - step, dataMax, dataMax + step] };
  }
  const rawBase = Math.pow(10, Math.floor(Math.log10(range)));
  const mults = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];

  // Target 4–5 labels first for a clean IBKR-style look
  for (const m of mults) {
    const step = rawBase * m;
    const niceMin = Math.floor(dataMin / step) * step;
    let niceMax = Math.ceil(dataMax / step) * step;
    if (niceMax <= dataMax) niceMax += step; // ensure strict headroom above the peak
    const count = Math.round((niceMax - niceMin) / step) + 1;
    if (count >= 4 && count <= 5) {
      const labels: number[] = [];
      for (let i = 0; i < count; i++) labels.push(niceMin + i * step);
      return { niceMin, niceMax, labels };
    }
  }

  // Fallback: accept 3–6
  for (const m of mults) {
    const step = rawBase * m;
    const niceMin = Math.floor(dataMin / step) * step;
    let niceMax = Math.ceil(dataMax / step) * step;
    if (niceMax <= dataMax) niceMax += step;
    const count = Math.round((niceMax - niceMin) / step) + 1;
    if (count >= 3 && count <= 6) {
      const labels: number[] = [];
      for (let i = 0; i < count; i++) labels.push(niceMin + i * step);
      return { niceMin, niceMax, labels };
    }
  }

  const mid = (dataMin + dataMax) / 2;
  return { niceMin: dataMin, niceMax: dataMax, labels: [dataMin, mid, dataMax] };
}

// Y-axis domain for the net-worth STACKED-AREA chart.
//
// A stacked area is read from a 0 baseline: at every point the four asset-class
// bands fill from 0 up to that point's net-worth total, so the top of the stack
// coincides with the net-worth line. The axis MUST therefore include 0.
//
// It is tempting to zoom the floor up to the data minimum the way a bare line
// chart would (tight band = more visible movement), but on a stacked area that
// is a correctness bug: every band lying below that lifted floor — Property and
// Markets, and usually Crypto, i.e. the bulk of net worth — projects beneath
// the visible window and gets clipped, collapsing the whole composition to just
// the topmost Reserves band smeared across the chart floor. So we anchor the
// floor at 0 for non-negative data, dip below it only for genuinely negative
// net worth (liabilities > assets), give the peak ~8% headroom, then nice-round
// both ends to clean label values. 0 is always inside [niceMin, niceMax].
export function computeYAxisDomain(dataMin: number, dataMax: number): NiceLevels {
  const lo = Math.min(dataMin, 0); // always include the stack's 0 baseline
  const hi = Math.max(dataMax, 0);
  const pad = Math.max((hi - lo) * 0.08, 1);
  // Non-negative data sits flush on the 0 baseline (no bottom pad); only
  // negative net worth extends the axis below zero.
  return computeNiceLevels(lo < 0 ? lo - pad : 0, hi + pad);
}

// Whether the net-worth stacked area is, across the visible window, effectively
// ONE asset class — in which case there are no lower bands to protect, so the
// 0-baseline (which keeps a multi-band stack readable, see computeYAxisDomain)
// would only squash the line into a flat strip near the top. The chart then
// zooms to the data band like the Liquid line instead.
//
// Takes each point's per-category value map (property/markets/crypto/reserves,
// absent = 0). Points with no real value (an empty/pre-breakdown row) are
// SKIPPED, not counted — otherwise the reserves fallback those rows carry would
// masquerade as a second band and force the flat 0-anchor back on a genuinely
// single-asset-class portfolio. A category counts as present only if it exceeds
// `eps` of that point's total (default 1%), so rounding dust or a trivial sliver
// doesn't defeat the zoom. Returns true only when exactly one band is present.
//
// Pure + exported so scripts/verify-networth-axis.ts can exercise it without React.
export function isEffectivelySingleBand(
  categoryValuesPerPoint: Array<Record<string, number>>,
  eps = 0.01,
): boolean {
  const present = new Set<string>();
  for (const cv of categoryValuesPerPoint) {
    let sum = 0;
    for (const k in cv) if (cv[k] > 0) sum += cv[k];
    if (sum <= 0) continue; // empty / pre-breakdown row — ignore, don't miscount
    for (const k in cv) if (cv[k] / sum > eps) present.add(k);
    if (present.size > 1) return false;
  }
  return present.size === 1;
}

// ── Time-true x positions ────────────────────────────────────────────────────
//
// X fractions (0..1) for a date-ordered series: each point sits at its date's
// fraction of the visible time span, NOT at its index. Index spacing was the
// old behaviour and it distorts the line's shape whenever cadence is mixed —
// monthly seed history next to daily recent rows gave a day and a month the
// same horizontal width, and a 3-week gap to the live tip drew as half the
// chart. Time-true spacing is the honest read of the same numbers.
//
// Accepts daily "YYYY-MM-DD" rows and intraday ISO datetimes (the Liquid · 1D
// series). Falls back to index spacing when the span is degenerate (all one
// date, unparseable input) so the chart never divides by zero, and clamps
// non-monotone stragglers so the path can never double back on itself.
export function timeFractions(dates: string[]): number[] {
  const n = dates.length;
  if (n === 0) return [];
  if (n === 1) return [0];
  const ts = dates.map((d) => Date.parse(d.length > 10 ? d : `${d}T12:00:00Z`));
  const t0 = ts[0];
  const span = ts[n - 1] - t0;
  if (!Number.isFinite(span) || span <= 0 || ts.some((t) => !Number.isFinite(t))) {
    return dates.map((_, i) => i / (n - 1));
  }
  let prev = 0;
  return ts.map((t) => {
    const f = Math.min(1, Math.max(0, (t - t0) / span));
    prev = Math.max(prev, f);
    return prev;
  });
}

// ── Journal-marker de-clustering ─────────────────────────────────────────────
//
// The chart plots one dot per journal entry at its date's x. On a long range
// (the default "All" spans the whole multi-year history) a burst of recent
// entries — e.g. a run of market swings all inside the last few weeks — collapses
// onto the same handful of pixels at the right edge and piles into a single
// unreadable, untappable smudge. This is why recent market events looked
// "missing" on the Overview graph even though the journal listed them all.
//
// Thin the dots to a minimum on-screen gap so each rendered marker stays legible
// and tappable. Kept in priority order — the selected entry (never dropped, so
// its guide/halo always renders), then the user's own decisions, then market
// swings — and, within a tier, first-listed wins (the caller lists market swings
// newest-first, so the most recent survive). Dropped entries stay in the journal
// and spread apart on shorter ranges. Time-true: a kept dot stays at its real x
// (never nudged off its date); occluded neighbours are simply omitted. The
// returned subset preserves the input order for a stable render/z-stack.
//
// Pure + exported so scripts/verify-marker-declutter.ts can exercise it without React.
export function thinMarkerDots<T extends { id: string; x: number; kind: "you" | "market" }>(
  dots: T[],
  selectedId: string | null | undefined,
  minGap: number,
): T[] {
  if (dots.length < 2) return dots;
  const priority = (d: T) => (d.id === selectedId ? 0 : d.kind === "you" ? 1 : 2);
  // Stable by (priority, original index) — decide keeps highest-priority first,
  // ties broken by input order, independent of the engine's sort stability.
  const ordered = dots
    .map((d, i) => ({ d, i }))
    .sort((a, b) => priority(a.d) - priority(b.d) || a.i - b.i);
  const keptX: number[] = [];
  const keptIds = new Set<string>();
  for (const { d } of ordered) {
    if (keptX.some((x) => Math.abs(x - d.x) < minGap)) continue;
    keptX.push(d.x);
    keptIds.add(d.id);
  }
  return dots.filter((d) => keptIds.has(d.id));
}

// Nearest point index for a pointer at x fraction `f` (0..1) over time-true
// positions — the scrub/tap inverse of timeFractions. Positions are sorted
// ascending, so a linear scan with early exit is O(k) to the answer.
export function nearestIndexForFraction(fractions: number[], f: number): number {
  if (fractions.length === 0) return 0;
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < fractions.length; i++) {
    const d = Math.abs(fractions[i] - f);
    if (d < bestDiff) { bestDiff = d; best = i; }
    else if (d > bestDiff) break; // ascending positions: diffs only grow past the minimum
  }
  return best;
}

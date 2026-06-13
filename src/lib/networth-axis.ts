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

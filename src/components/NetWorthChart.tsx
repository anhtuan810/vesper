"use client";

import { useState, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useDisplayCurrencyState } from "@/lib/hooks";
import { useChartHaptic } from "@/hooks/useChartHaptic";
import { getUsdRate, SUPPORTED_CURRENCIES, formatMoney, type DisplayCurrency } from "@/lib/money";
import { convertCurrency } from "@/lib/currency-convert";
import { formatDate } from "@/lib/utils";
import { categoryBreakdown, CATEGORY_COLOR, CATEGORY_LABEL_SHORT, STACK_ORDER, type Category } from "@/lib/categories";
import { computeNiceLevels } from "@/lib/networth-axis";

export const RANGES = ["1D", "1W", "1M", "3M", "1Y", "3Y", "All"] as const;
export type Range = (typeof RANGES)[number];

// Mirrors the snapshots route's RANGE_DAYS — used to tell whether a timeframe's
// start predates the earliest real data we have (in which case stretching a
// handful of points across that whole width would misrepresent the history).
const RANGE_WINDOW_DAYS: Record<Range, number | null> = {
  "1D": 1, "1W": 7, "1M": 30, "3M": 90, "1Y": 365, "3Y": 1095, "All": null,
};

export function rangeStartDate(r: Range): string | null {
  const days = RANGE_WINDOW_DAYS[r];
  if (days == null) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export interface SnapshotPoint {
  date: string;
  total_value: number;
  // Per-currency native sums for THIS row (see snapshot.ts native_breakdown).
  // Preferred conversion path: each currency converts directly to the display
  // currency (identity for the home-currency bucket — no FX, no drift). Absent
  // on rows written before this field existed, and on synthesized points.
  native_breakdown?: Record<string, number> | null;
  // Per-asset-type breakdown for THIS row (see snapshot.ts breakdown, USD for
  // DB rows). Real estate is equity-net, so this sums to total_value. The
  // synthesized live "today" tip carries its own live breakdown (display
  // currency, from the current asset set) so its category proportions reflect
  // today's actual composition rather than inheriting the prior row's; absent
  // only on rows written before this field existed.
  breakdown?: Record<string, number> | null;
}

// Live USD-based rate map (see money.ts) — used for cross-rate conversion.
export function buildLiveRates(): Record<string, number> {
  const rates: Record<string, number> = {};
  for (const c of SUPPORTED_CURRENCIES) {
    if (c === "USD") continue;
    rates[c] = getUsdRate(c);
  }
  return rates;
}

// Converts a single stored point's total_value to the display currency.
// Prefers native_breakdown (direct native→display cross-rate per currency,
// identity for the home-currency bucket — no FX, no drift); falls back to
// total_value converted at the live display rate when native_breakdown is
// absent/empty or a needed cross-rate is missing. The live "today" tip
// carries neither field — its total_value is the live net worth already
// converted to the display currency by useNetWorth, so it's returned
// unchanged.
export function convertPointToDisplay(
  p: SnapshotPoint,
  displayCurrency: DisplayCurrency,
  liveRates: Record<string, number>,
): number {
  const today = new Date().toISOString().slice(0, 10);
  if (p.date === today) return p.total_value;

  if (p.native_breakdown && Object.keys(p.native_breakdown).length > 0) {
    let total = 0;
    let ok = true;
    for (const [cur, amt] of Object.entries(p.native_breakdown)) {
      const converted = convertCurrency(amt, cur, displayCurrency, liveRates);
      if (converted == null) { ok = false; break; }
      total += converted;
    }
    if (ok) return total;
  }

  const converted = convertCurrency(p.total_value, "USD", displayCurrency, liveRates);
  return converted ?? p.total_value * (liveRates[displayCurrency] ?? 1);
}

interface Props {
  range: Range;
  onRangeChange: (r: Range) => void;
  series: SnapshotPoint[];
  loading: boolean;
  onSelectPoint?: (point: SnapshotPoint | null) => void;
  valuesSettled?: boolean;
  // Count of real (DB-backed) snapshot rows on distinct days, before `buildSeries`
  // synthesizes today's live tip — distinguishes "day one" from "real history".
  realPointCount?: number;
  // Earliest real snapshot date, for the "Tracking since {date}" caption.
  trackingSinceDate?: string | null;
  // "Liquid only" mode: render a single zoomed line (no stacked bands, no
  // category breakdown tooltip); the series total is the combined liquid value.
  lineOnly?: boolean;
  // Whether the Liquid-only view is active — gates the intraday 1D pill (enabled
  // only here, never by trackingSinceDate).
  liquidOnly?: boolean;
  // Journal markers: a dot per entry drawn on the line at its date. When provided
  // (desktop Overview only) the chart enters a two-layer selection mode — moving
  // the pointer PREVIEWS the nearest entry (a small box appears next to it),
  // clicking COMMITS it (onMarkerClick). Mobile (PortfolioTab) passes nothing, so
  // its hover-scrub behaviour is unchanged. `kind` distinguishes a personal
  // decision ("you") from a market-event entry ("market") for the dot colour;
  // title/sub/value are the short content shown in the hover box.
  markers?: { id: string; date: string; kind?: "you" | "market"; title?: string; sub?: string; value?: string }[];
  selectedMarkerId?: string | null;
  onMarkerClick?: (id: string) => void;
  // First-visit cinematic reveal: when true, the net-worth line strokes itself in
  // left→right and the journal dots light up oldest→newest (gated upstream to the
  // first session landing + prefers-reduced-motion). Visual only — no behaviour.
  revealLine?: boolean;
}

const CURRENCY_SYMBOL: Record<string, string> = {
  EUR: "€", USD: "$", GBP: "£", CHF: "Fr.", JPY: "¥", AUD: "A$", CAD: "C$",
};

function fmtYLabel(value: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency] ?? currency;
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  // Match the hero number's locale (nl-NL) so the axis and headline share one
  // grammar — e.g. €0,1 mln rather than a US-compacted €0.1M next to €115.077.
  const fmt = (n: number) =>
    new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(n);
  if (abs >= 1_000_000) return `${sign}${sym}${fmt(abs / 1_000_000)} mln`;
  if (abs >= 1_000) return `${sign}${sym}${fmt(abs / 1_000)}K`;
  return `${sign}${sym}${new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(abs)}`;
}

const X_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// A sparse x-axis label for a "YYYY-MM-DD" date — day+month on short windows,
// month+year on long ones, so the time premise has a temporal anchor.
function formatXLabel(date: string, range: Range): string {
  const mon = X_MONTHS[Math.max(0, Math.min(11, parseInt(date.slice(5, 7), 10) - 1))];
  if (range === "1D" || range === "1W" || range === "1M") return `${parseInt(date.slice(8, 10), 10)} ${mon}`;
  return `${mon} '${date.slice(2, 4)}`;
}

const CHART_PAD_TOP = 6;
const CHART_PAD_RIGHT = 0;   // draw to the full width so the right edge (today) aligns with the content edge / "Now"; the end-point halo overflows into the margin (svg overflow:visible)
const CHART_PAD_BOTTOM = 8;  // same — prevents clipping when current value is near niceMin
// Finger travel (px) below which a touch counts as a tap, not a scrub — a tap
// on a decision dot commits it; a drag reads the value along the line.
const TAP_SLOP = 8;

function buildPath(
  values: number[], W: number, H: number, yMin: number, yMax: number, drawW: number
): { line: string; projectY: (v: number) => number } {
  const projectY = makeProjectY(H, yMin, yMax);

  if (values.length < 2) return { line: "", projectY };

  const toX = (i: number) => (i / (values.length - 1)) * drawW;
  const pts = values.map((c, i) => ({ x: toX(i), y: projectY(c) }));
  let line = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    line += ` L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`;
  }

  return { line, projectY };
}

function makeProjectY(H: number, yMin: number, yMax: number): (v: number) => number {
  const yRange = Math.max(yMax - yMin, 1);
  const drawH = H - CHART_PAD_TOP - CHART_PAD_BOTTOM;
  return (v) => CHART_PAD_TOP + drawH - ((v - yMin) / yRange) * drawH;
}

// Saturated band-fill tokens for the stacked area bands — distinct from
// CATEGORY_COLOR (full-saturation, used for the tooltip swatches) and from
// the -soft wash tokens (reserved for chips/pills).
const CATEGORY_FILL: Record<Category, string> = {
  property: "var(--cat-property-band)",
  markets:  "var(--cat-markets-band)",
  reserves: "var(--cat-reserves-band)",
  crypto:   "var(--cat-crypto-band)",
};

// Top-edge stroke tokens for each band — drawn along the cumulative-upper
// boundary only, on top of the fill.
const CATEGORY_EDGE: Record<Category, string> = {
  property: "var(--cat-property-edge)",
  markets:  "var(--cat-markets-edge)",
  reserves: "var(--cat-reserves-edge)",
  crypto:   "var(--cat-crypto-edge)",
};

// Per-point category proportions (fractions of the displayed total, summing
// to 1) derived from each point's asset-type breakdown. A point without a
// usable breakdown (only DB rows written before the breakdown field existed —
// the synthesized live "today" tip now carries its own live breakdown)
// inherits the nearest preceding point's proportions, so the right edge of the
// stack never collapses.
function computeCategoryProportions(points: SnapshotPoint[]): Record<Category, number>[] {
  const result: Record<Category, number>[] = [];
  let last: Record<Category, number> | null = null;
  for (const p of points) {
    const cat = categoryBreakdown(p.breakdown);
    const sum = STACK_ORDER.reduce((s, c) => s + cat[c], 0);
    let props: Record<Category, number>;
    if (sum > 0) {
      props = { property: 0, markets: 0, crypto: 0, reserves: 0 };
      for (const c of STACK_ORDER) props[c] = cat[c] / sum;
      last = props;
    } else {
      props = last ?? { property: 0, markets: 0, crypto: 0, reserves: 1 };
    }
    result.push(props);
  }
  return result;
}

// Builds a filled band between a category's cumulative-lower and
// cumulative-upper boundaries across all points — straight (L) segments,
// matching the net-worth line's lack of smoothing.
function buildAreaPath(
  lower: number[], upper: number[], projectY: (v: number) => number, drawW: number
): string {
  const n = upper.length;
  if (n < 2) return "";
  const toX = (i: number) => (i / (n - 1)) * drawW;
  let d = `M ${toX(0).toFixed(2)} ${projectY(upper[0]).toFixed(2)}`;
  for (let i = 1; i < n; i++) d += ` L ${toX(i).toFixed(2)} ${projectY(upper[i]).toFixed(2)}`;
  for (let i = n - 1; i >= 0; i--) d += ` L ${toX(i).toFixed(2)} ${projectY(lower[i]).toFixed(2)}`;
  return d + " Z";
}

// Builds an open polyline tracing a category's cumulative-upper boundary —
// used to stroke the top edge of its band, distinguishing it from the band
// stacked above.
function buildEdgePath(
  upper: number[], projectY: (v: number) => number, drawW: number
): string {
  const n = upper.length;
  if (n < 2) return "";
  const toX = (i: number) => (i / (n - 1)) * drawW;
  let d = `M ${toX(0).toFixed(2)} ${projectY(upper[0]).toFixed(2)}`;
  for (let i = 1; i < n; i++) d += ` L ${toX(i).toFixed(2)} ${projectY(upper[i]).toFixed(2)}`;
  return d;
}

// `todayBreakdown` is the live per-asset-type valuation (display currency,
// same equity basis as netTotal/the Holdings groups) for the CURRENT asset
// set — gives the synthesized "today" tip a real breakdown so its category
// proportions reflect today's composition (e.g. zero for a just-removed
// category) instead of inheriting the prior row's via computeCategoryProportions's
// sum===0 fallback.
export function buildSeries(raw: SnapshotPoint[], currentNet: number, todayBreakdown?: Record<string, number>): SnapshotPoint[] {
  const today = new Date().toISOString().slice(0, 10);
  const filtered = raw.filter((p) => p.date !== today);
  filtered.push({ date: today, total_value: currentNet, breakdown: todayBreakdown });
  return filtered;
}

export function NetWorthChart(props: Props) {
  const { range, onRangeChange, series, loading, valuesSettled, realPointCount, trackingSinceDate, lineOnly, liquidOnly } = props;
  // Strip the live tip (last point = today's netTotal) until values are fully settled,
  // so the chart doesn't redraw as netTotal steps through intermediate states.
  // Memoized so the slice doesn't mint a new reference on every scrub re-render
  // (which would defeat the derived-geometry memo below).
  const displaySeries = useMemo(
    () => (valuesSettled ? series : series.slice(0, -1)),
    [series, valuesSettled],
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  // Marker hover-preview (the "peek" layer): the entry the pointer is nearest to.
  const [hoveredMarker, setHoveredMarker] = useState<string | null>(null);
  const haptic = useChartHaptic();
  const { currency: displayCurrency } = useDisplayCurrencyState();
  const [chartWidth, setChartWidth] = useState(280);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  // Tap-vs-scrub tracking for touch: a tap on/near a decision dot commits it,
  // while a drag scrubs the value along the line.
  const touchStartXRef = useRef(0);
  const touchMovedRef = useRef(false);
  // Whether the consumer wants a value readout on scrub. Only the mobile
  // Overview (PortfolioTab) passes onSelectPoint; the desktop Overview and the
  // marketing chart do not, so they keep the pure decision-dot interaction.
  const scrubbable = !!props.onSelectPoint;

  useEffect(() => {
    const el = svgContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setChartWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Clear selection whenever the series reference changes (range switch or data reload)
  useEffect(() => {
    setSelectedIndex(null); // eslint-disable-line react-hooks/set-state-in-effect
  }, [series]);

  // Propagate selection to parent whenever index changes — emit the point
  // already converted to the display currency, so the hero (which renders
  // this with an identity formatMoney) matches the chart exactly.
  useEffect(() => {
    const raw = selectedIndex !== null ? (displaySeries[selectedIndex] ?? null) : null;
    if (!raw) {
      props.onSelectPoint?.(null);
      return;
    }
    const liveRates = buildLiveRates();
    props.onSelectPoint?.({ ...raw, total_value: convertPointToDisplay(raw, displayCurrency, liveRates) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  const W = chartWidth;
  const H = 116;

  // Convert all series values to display currency so the axis and curve are in
  // the same unit as the hero number above the chart. Each row's native_breakdown
  // converts directly per currency (identity for the home-currency bucket — no
  // FX, no drift); rows without it fall back to total_value at the live display
  // rate. The synthesized "today" tip is the live net worth already converted
  // to the display currency by useNetWorth — returned unchanged.
  // Memoized: scrubbing re-renders on every pointer move via setSelectedIndex,
  // and re-running the per-point currency conversion, min/max scan, line path,
  // and four stacked-band paths each frame makes touch-scrub janky on device.
  // Live FX updates arrive with a new `series` reference, so the memo key
  // covers them.
  const converted = useMemo(() => {
    const liveRates = buildLiveRates();
    return displaySeries.map((p) => ({
      ...p,
      total_value: convertPointToDisplay(p, displayCurrency, liveRates),
    }));
  }, [displaySeries, displayCurrency]);

  const values = useMemo(() => converted.map((p) => p.total_value), [converted]);
  const up = converted.length >= 2 && converted[converted.length - 1].total_value >= converted[0].total_value;
  const strokeColor = up ? "var(--positive-text)" : "var(--negative-text)";

  // `realPointCount`/`trackingSinceDate` are derived from the FULL snapshot
  // history (not the range-clipped display series) — so the marker reflects a
  // genuine track-from-today cold start, never "this bounded window happens to
  // be narrower than the data it's clipped from".
  const realCount = realPointCount ?? displaySeries.length;
  const showSingleMarker = !loading && realCount < 2;
  const showLabels = !showSingleMarker && !loading && displaySeries.length >= 2;
  const interactive = !showSingleMarker && !loading && displaySeries.length >= 2;
  // Journal-marker mode: render static clickable decision dots, no hover-scrub.
  const markerMode = !!props.markers && props.markers.length > 0 && interactive;
  const currentValue = converted.length > 0 ? converted[converted.length - 1].total_value : null;

  // Y domain fits the visible (range-clipped) series — recomputed on every range
  // switch. The chart no longer prints a y-axis label column, so the domain no
  // longer needs "nice" round levels: it just frames the data tightly. Liquid
  // (lineOnly) zooms to a padded data band like a price chart; the stacked area
  // still anchors at 0 (bands can't float) but takes only a slim top pad, so the
  // composition fills the plot instead of sitting under a 0→600K headroom.
  const { niceMin, niceMax } = useMemo(() => {
    const dataMin = values.length >= 2 ? Math.min(...values) : 0;
    const dataMax = values.length >= 2 ? Math.max(...values) : 1;
    if (lineOnly) {
      const pad = Math.max((dataMax - dataMin) * 0.08, 1);
      const nice = computeNiceLevels(dataMin - pad, dataMax + pad);
      return { niceMin: nice.niceMin, niceMax: nice.niceMax };
    }
    const pad = Math.max(dataMax * 0.08, 1);
    return { niceMin: 0, niceMax: dataMax + pad };
  }, [values, lineOnly]);

  const drawW = W - CHART_PAD_RIGHT;
  const projectY = makeProjectY(H, niceMin, niceMax);
  const { line } = useMemo(
    () => buildPath(values, W, H, niceMin, niceMax, drawW),
    [values, W, H, niceMin, niceMax, drawW],
  );

  // Gradient area under the line — lineOnly (Liquid) mode only. Same top
  // boundary (x positions + projected y) as `line`, then down to the plot
  // baseline (y = H) and closed, so the fill fades from the line to nothing.
  const areaPath = useMemo(() => {
    if (!lineOnly || values.length < 2) return "";
    const toX = (i: number) => (i / (values.length - 1)) * drawW;
    let d = `M ${toX(0).toFixed(2)} ${projectY(values[0]).toFixed(2)}`;
    for (let i = 1; i < values.length; i++) d += ` L ${toX(i).toFixed(2)} ${projectY(values[i]).toFixed(2)}`;
    d += ` L ${toX(values.length - 1).toFixed(2)} ${H.toFixed(2)}`;
    d += ` L ${toX(0).toFixed(2)} ${H.toFixed(2)} Z`;
    return d;
    // projectY is a fresh closure each render; its inputs are H/niceMin/niceMax.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, drawW, H, niceMin, niceMax, lineOnly]);

  // Per-category stacked bands — each point's segments sum exactly to
  // `values[i]` (the displayed total), so the top of the stack equals the
  // net-worth line at every point in any display currency.
  const { categoryProportions, stackBounds } = useMemo(() => {
    const proportions = computeCategoryProportions(converted);
    const bounds = {} as Record<Category, { lower: number[]; upper: number[] }>;
    const cumulative = new Array(values.length).fill(0);
    for (const c of STACK_ORDER) {
      const lower = cumulative.slice();
      for (let i = 0; i < values.length; i++) cumulative[i] += values[i] * proportions[i][c];
      bounds[c] = { lower, upper: cumulative.slice() };
    }
    return { categoryProportions: proportions, stackBounds: bounds };
  }, [converted, values]);

  // Band path strings, precomputed for the same reason as `line` above.
  const bandPaths = useMemo(() => {
    const paths = {} as Record<Category, { area: string; edge: string }>;
    for (const c of STACK_ORDER) {
      paths[c] = {
        area: buildAreaPath(stackBounds[c].lower, stackBounds[c].upper, projectY, drawW),
        edge: buildEdgePath(stackBounds[c].upper, projectY, drawW),
      };
    }
    return paths;
    // projectY is a fresh closure each render; its inputs are H/niceMin/niceMax.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stackBounds, drawW, H, niceMin, niceMax]);

  const lastY = values.length >= 2 ? projectY(values[values.length - 1]) : H / 2;

  const selectedX =
    selectedIndex !== null && displaySeries.length >= 2
      ? (selectedIndex / (displaySeries.length - 1)) * drawW
      : null;
  const selectedY =
    selectedIndex !== null && values.length >= 2
      ? projectY(values[selectedIndex])
      : null;

  const showEndMarker = selectedIndex === null || selectedIndex === displaySeries.length - 1;

  function calcIndex(clientX: number, rect: DOMRect): number {
    const relX = (clientX - rect.left) / rect.width;
    const rawIdx = Math.round(relX * (displaySeries.length - 1));
    return Math.min(Math.max(rawIdx, 0), displaySeries.length - 1);
  }

  // Decision dots: every journal marker placed at the nearest plotted point whose
  // date falls within the visible (range-clipped) window. Carries the short
  // content shown in the hover-preview box.
  // Memoized so the O(markers×points) nearest-point scan + Date parsing isn't
  // rebuilt on every pointer-move re-render (hover state changes don't touch its
  // inputs). projectY is a fresh closure; its inputs H/niceMin/niceMax are deps.
  const markerDots = useMemo<{ id: string; x: number; y: number; kind: "you" | "market"; title?: string; sub?: string; value?: string; net?: number }[]>(() => {
    const dots: { id: string; x: number; y: number; kind: "you" | "market"; title?: string; sub?: string; value?: string; net?: number }[] = [];
    if (markerMode && values.length >= 2) {
      const dates = displaySeries.map((p) => p.date);
      const first = dates[0];
      const last = dates[dates.length - 1];
      for (const mk of props.markers!) {
        if (mk.date < first || mk.date > last) continue;
        const t = new Date(mk.date).getTime();
        let best = 0;
        let bestDiff = Infinity;
        for (let i = 0; i < dates.length; i++) {
          const d = Math.abs(new Date(dates[i]).getTime() - t);
          if (d < bestDiff) { bestDiff = d; best = i; }
        }
        dots.push({ id: mk.id, x: (best / (values.length - 1)) * drawW, y: projectY(values[best]), kind: mk.kind ?? "you", title: mk.title, sub: mk.sub, value: mk.value, net: values[best] });
      }
    }
    return dots;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerMode, values, displaySeries, props.markers, drawW, H, niceMin, niceMax]);

  // The marker nearest the pointer's x — used so hovering anywhere along the line
  // previews the closest entry (dots can be dense), not only exact dot hits.
  function nearestMarkerId(clientX: number, rect: DOMRect): string | null {
    if (!markerDots.length) return null;
    const xView = ((clientX - rect.left) / rect.width) * W;
    let bestId: string | null = null;
    let bestDiff = Infinity;
    for (const d of markerDots) {
      const diff = Math.abs(d.x - xView);
      if (diff < bestDiff) { bestDiff = diff; bestId = d.id; }
    }
    return bestId;
  }

  // Like nearestMarkerId, but only when the pointer is genuinely near a dot —
  // so scrubbing the open stretches of the line reads the value without a
  // distant dot hijacking the tap or flashing its preview. The threshold is a
  // comfortable finger's width in view units.
  function nearMarkerWithin(clientX: number, rect: DOMRect): string | null {
    const id = nearestMarkerId(clientX, rect);
    if (!id) return null;
    const xView = ((clientX - rect.left) / rect.width) * W;
    const dot = markerDots.find((d) => d.id === id)!;
    return Math.abs(dot.x - xView) <= Math.max(16, W * 0.05) ? id : null;
  }

  const chartHandlers = !interactive
    ? {}
    : markerMode && scrubbable
    ? {
        // Merged interaction: scrubbing reads the portfolio value along the line
        // (the hero number + cursor follow the pointer), AND the decision dots
        // stay selectable — a tap on/near a dot commits that entry, a drag reads
        // the value. Both layers live together so the value is never hidden
        // behind the entry picker.
        onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
          const rect = e.currentTarget.getBoundingClientRect();
          const idx = calcIndex(e.clientX, rect);
          setSelectedIndex(idx);
          haptic(idx);
          setHoveredMarker(nearMarkerWithin(e.clientX, rect));
        },
        onMouseLeave() { setSelectedIndex(null); setHoveredMarker(null); haptic(null); },
        onClick(e: React.MouseEvent<HTMLDivElement>) {
          const id = nearMarkerWithin(e.clientX, e.currentTarget.getBoundingClientRect());
          if (id) props.onMarkerClick?.(id);
        },
        onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.touches[0].clientX;
          touchStartXRef.current = x;
          touchMovedRef.current = false;
          const idx = calcIndex(x, rect);
          setSelectedIndex(idx);
          haptic(idx);
          setHoveredMarker(nearMarkerWithin(x, rect));
        },
        onTouchMove(e: React.TouchEvent<HTMLDivElement>) {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.touches[0].clientX;
          if (Math.abs(x - touchStartXRef.current) > TAP_SLOP) touchMovedRef.current = true;
          const idx = calcIndex(x, rect);
          setSelectedIndex(idx);
          haptic(idx);
          setHoveredMarker(nearMarkerWithin(x, rect));
        },
        onTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
          // A tap (no meaningful drag) on/near a dot commits that decision; a
          // drag was just a value scrub and commits nothing.
          if (!touchMovedRef.current) {
            const x = e.changedTouches[0]?.clientX;
            const id = x != null ? nearMarkerWithin(x, e.currentTarget.getBoundingClientRect()) : null;
            if (id) props.onMarkerClick?.(id);
          }
          setSelectedIndex(null);
          setHoveredMarker(null);
          haptic(null);
        },
      }
    : markerMode
    ? {
        // Pure decision-dot selection (desktop Overview / marketing): move
        // previews the nearest entry, click commits it. No value scrub.
        onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
          setHoveredMarker(nearestMarkerId(e.clientX, e.currentTarget.getBoundingClientRect()));
        },
        onMouseLeave() { setHoveredMarker(null); },
        onClick(e: React.MouseEvent<HTMLDivElement>) {
          const id = nearestMarkerId(e.clientX, e.currentTarget.getBoundingClientRect());
          if (id) props.onMarkerClick?.(id);
        },
        onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
          setHoveredMarker(nearestMarkerId(e.touches[0].clientX, e.currentTarget.getBoundingClientRect()));
        },
        onTouchEnd() {
          if (hoveredMarker) props.onMarkerClick?.(hoveredMarker);
          setHoveredMarker(null);
        },
      }
    : {
        onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
          const idx = calcIndex(e.clientX, e.currentTarget.getBoundingClientRect());
          setSelectedIndex(idx);
          haptic(idx);
        },
        onMouseLeave() { setSelectedIndex(null); haptic(null); },
        onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
          const idx = calcIndex(e.touches[0].clientX, e.currentTarget.getBoundingClientRect());
          setSelectedIndex(idx);
          haptic(idx);
        },
        onTouchMove(e: React.TouchEvent<HTMLDivElement>) {
          const idx = calcIndex(e.touches[0].clientX, e.currentTarget.getBoundingClientRect());
          setSelectedIndex(idx);
          haptic(idx);
        },
        onTouchEnd() { setSelectedIndex(null); haptic(null); },
      };

  // Per-class hover card — top-down order (reserves, crypto, markets,
  // property), mirroring the stack read top-down. Flips to the left of the
  // cursor near the chart's right edge so it never overflows. Breakdown-only
  // annotation — the hero already surfaces the date and total on hover.
  const TOOLTIP_WIDTH = 168;
  const tooltipSegments = selectedIndex !== null
    ? [...STACK_ORDER].reverse()
        .map((c) => ({ category: c, value: values[selectedIndex] * categoryProportions[selectedIndex][c] }))
        .filter((s) => Math.abs(s.value) >= 0.5)
    : [];
  const flipTooltipLeft = selectedX !== null && selectedX + TOOLTIP_WIDTH + 16 > W;

  // The hovered marker's full dot (for the preview box).
  const hoveredDot = markerMode ? markerDots.find((d) => d.id === hoveredMarker) ?? null : null;
  const MARKER_TIP_W = 184;

  return (
    <div>
      {/* Chart area — full-bleed SVG (no y-axis label column; the hero number
          above is the value reference, and exact values surface on scrub). */}
      <div style={{ display: "flex", alignItems: "stretch", height: H }}>

        {/* Chart SVG — interaction target; handlers attached here so getBoundingClientRect covers only the curve area */}
        <div
          ref={svgContainerRef}
          style={{ flex: 1, position: "relative", touchAction: interactive ? "none" : undefined, cursor: markerMode ? "pointer" : undefined }}
          {...chartHandlers}
        >
          {showSingleMarker ? (
            <div
              style={{
                height: H,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 8,
              }}
            >
              <svg viewBox={`0 0 40 40`} width={20} height={20} aria-hidden>
                <circle cx={20} cy={20} r={9} fill="none" stroke={strokeColor} strokeOpacity={0.25} />
                <circle cx={20} cy={20} r={4} fill={strokeColor} />
              </svg>
              {currentValue != null && (
                <div className="tnum" style={{ fontSize: "var(--fs-meta)", color: "var(--text-dim)" }}>
                  {fmtYLabel(currentValue, displayCurrency)}
                </div>
              )}
              <div style={{ fontFamily: "var(--font-numeric)", fontSize: "var(--fs-micro)", color: "var(--text-faint)" }}>
                Tracking since {formatDate(trackingSinceDate ?? new Date().toISOString().slice(0, 10))}
              </div>
            </div>
          ) : loading ? (
            // Calm skeleton at the same geometry — a faint baseline and a quiet
            // pre-baked curve — so the chart doesn't snap-pop the layout on load.
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: "block" }} aria-hidden>
              {[0.3, 0.55, 0.8].map((f) => (
                <line key={f} x1={0} y1={H * f} x2={drawW} y2={H * f} stroke="var(--border)" strokeWidth={1} opacity={0.35} />
              ))}
              <path
                d={`M 0 ${(H * 0.64).toFixed(1)} L ${(drawW * 0.34).toFixed(1)} ${(H * 0.56).toFixed(1)} L ${(drawW * 0.67).toFixed(1)} ${(H * 0.42).toFixed(1)} L ${drawW.toFixed(1)} ${(H * 0.34).toFixed(1)}`}
                fill="none" stroke="var(--text-faint)" strokeWidth={2} strokeOpacity={0.3} strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              width="100%"
              height={H}
              style={{ display: "block", overflow: "visible" }}
            >
              {/* Stacked asset-class bands — bottom (property) to top (reserves),
                  painted under the net-worth line so the trajectory reads identically.
                  Suppressed in lineOnly mode, which shows a single combined line. */}
              {!lineOnly && STACK_ORDER.map((c) => (
                <g key={c}>
                  <path
                    d={bandPaths[c].area}
                    fill={CATEGORY_FILL[c]}
                    fillOpacity={0.58}
                  />
                  <path
                    d={bandPaths[c].edge}
                    fill="none"
                    stroke={CATEGORY_EDGE[c]}
                    strokeWidth={0.5}
                    strokeOpacity={0.55}
                  />
                </g>
              ))}
              {/* Soft gradient fill beneath the line — Liquid (lineOnly) mode
                  only; follows the up/down strokeColor and fades to nothing at
                  the baseline. Rendered behind the line. */}
              {lineOnly && (
                <>
                  <defs>
                    <linearGradient id="liquid-area-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={strokeColor} stopOpacity={0.16} />
                      <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <path d={areaPath} fill="url(#liquid-area-grad)" stroke="none" />
                </>
              )}
              {/* Soft same-hue glow under the trajectory, then the line itself —
                  thicker than the band edges so the net-worth path owns the silhouette. */}
              <path d={line} fill="none" stroke={strokeColor} strokeWidth={3.5} strokeOpacity={0.12} strokeLinecap="round" strokeLinejoin="round" {...(props.revealLine ? { pathLength: 1, className: "nw-line-draw" } : {})} />
              <path
                d={line}
                fill="none"
                stroke={strokeColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                {...(props.revealLine ? { pathLength: 1, className: "nw-line-draw" } : {})}
              />
              {/* Static end-point marker — hidden while scrubbing a non-last point,
                  and in marker mode (the decision dots are the markers instead) */}
              {showEndMarker && !markerMode && (
                <>
                  <circle cx={drawW} cy={lastY} r={6} fill="none" stroke={strokeColor} strokeOpacity={0.25} />
                  <circle cx={drawW} cy={lastY} r={3} fill={strokeColor} />
                </>
              )}
              {/* Journal decision dots — one per entry. The pointer handlers live
                  on the container (move previews the nearest entry, click commits),
                  so the dots are pure visuals. Default dots are small and quiet; the
                  hovered one enlarges; the selected one is filled with a halo.
                  Market-event entries ("market") use a muted neutral, personal
                  decisions ("you") the accent. */}
              {markerMode && hoveredDot && hoveredDot.id !== props.selectedMarkerId && (
                <line
                  x1={hoveredDot.x} y1={hoveredDot.y} x2={hoveredDot.x} y2={H}
                  stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="3 3" opacity={0.45}
                  style={{ pointerEvents: "none" }}
                />
              )}
              {/* Selected-entry time-cursor: a faint accent guide from the
                  committed dot down to the axis, so the rewound point is anchored
                  in time (not drawn while that dot is actively hovered). */}
              {markerMode && (() => {
                const selDot = markerDots.find((d) => d.id === props.selectedMarkerId);
                if (!selDot || selDot.id === hoveredMarker) return null;
                return (
                  <line
                    x1={selDot.x} y1={selDot.y} x2={selDot.x} y2={H}
                    stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 3" opacity={0.32}
                    style={{ pointerEvents: "none" }}
                  />
                );
              })()}
              {markerMode && markerDots.map((dot, i) => {
                const sel = dot.id === props.selectedMarkerId;
                const hov = dot.id === hoveredMarker;
                const dotColor = dot.kind === "market" ? "var(--text-faint)" : "var(--accent)";
                // First-visit stagger: dots light up oldest→newest after the line
                // settles. Step is clamped so a long line never crawls (~0.5s total).
                const revealStep = Math.min(0.07, 0.5 / Math.max(1, markerDots.length - 1));
                const revealStyle: CSSProperties = props.revealLine
                  ? { pointerEvents: "none", animationDelay: `${(1.15 + i * revealStep).toFixed(2)}s` }
                  : { pointerEvents: "none" };
                return (
                  <g key={dot.id} className={props.revealLine ? "nw-dot-rise" : undefined} style={revealStyle}>
                    {sel ? (
                      <>
                        <circle cx={dot.x} cy={dot.y} r={8} fill="none" stroke={dotColor} strokeOpacity={0.22} />
                        <circle cx={dot.x} cy={dot.y} r={5} fill={dotColor} stroke="var(--surface)" strokeWidth={1.5} />
                      </>
                    ) : hov ? (
                      <circle cx={dot.x} cy={dot.y} r={4.5} fill={dotColor} stroke="var(--surface)" strokeWidth={1.5} />
                    ) : dot.kind === "market" ? (
                      // Auto market-swing entries stay quiet — a small faint dot — so
                      // the user's own decisions (accent rings) own the line.
                      <circle cx={dot.x} cy={dot.y} r={1.7} fill="var(--text-faint)" opacity={0.55} />
                    ) : (
                      <circle cx={dot.x} cy={dot.y} r={2.8} fill="var(--surface)" stroke={dotColor} strokeWidth={1.5} strokeOpacity={0.85} />
                    )}
                  </g>
                );
              })}
              {/* Scrub marker — vertical guide + halo + dot */}
              {selectedIndex !== null && selectedX !== null && selectedY !== null && (
                <>
                  <line
                    x1={selectedX} y1={0} x2={selectedX} y2={H}
                    stroke="var(--text-dim)" strokeWidth={1}
                    strokeDasharray="3 3" opacity={0.7}
                  />
                  <circle cx={selectedX} cy={selectedY} r={6} fill="none" stroke={strokeColor} strokeOpacity={0.25} />
                  <circle cx={selectedX} cy={selectedY} r={3} fill={strokeColor} />
                </>
              )}
            </svg>
          )}

          {/* Per-class breakdown card — one row per non-zero category. The hero
              already surfaces the date and total on hover, so this is an
              annotation only: no header, no divider, no total. */}
          {!lineOnly && selectedIndex !== null && selectedX !== null && tooltipSegments.length > 0 && !hoveredDot && (
            <div
              style={{
                position: "absolute",
                top: 4,
                ...(flipTooltipLeft ? { right: W - selectedX + 8 } : { left: selectedX + 8 }),
                width: TOOLTIP_WIDTH,
                background: "var(--surface)",
                border: "0.5px solid var(--border)",
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-soft)",
                padding: "8px 10px",
                pointerEvents: "none",
                zIndex: 2,
              }}
            >
              {tooltipSegments.map(({ category, value }) => (
                <div key={category} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: CATEGORY_COLOR[category], flexShrink: 0, display: "inline-block" }} />
                    <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--fs-caption)", color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                      {CATEGORY_LABEL_SHORT[category]}
                    </span>
                  </div>
                  <span className="tnum" style={{ fontSize: "var(--fs-caption)", color: "var(--text)", marginLeft: 8 }}>
                    {formatMoney(value, displayCurrency, displayCurrency)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Marker hover-preview ("peek" layer): short content for the entry
              nearest the pointer. Clicking commits the selection. */}
          {markerMode && hoveredDot && (
            <div
              style={{
                position: "absolute",
                left: Math.min(Math.max(hoveredDot.x, MARKER_TIP_W / 2 + 4), W - MARKER_TIP_W / 2 - 4),
                // Flip below the dot for high points so the box never overflows above the chart.
                top: hoveredDot.y < H * 0.55 ? hoveredDot.y + 14 : hoveredDot.y - 14,
                transform: hoveredDot.y < H * 0.55 ? "translate(-50%, 0)" : "translate(-50%, -100%)",
                width: MARKER_TIP_W,
                background: "var(--surface)",
                border: "0.5px solid var(--border)",
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-soft)",
                padding: "9px 11px",
                pointerEvents: "none",
                zIndex: 3,
              }}
            >
              {hoveredDot.sub && (
                <div className="eyebrow" style={{ color: "var(--text-faint)", marginBottom: 3 }}>
                  {hoveredDot.sub}{hoveredDot.kind === "market" ? " · Market" : ""}
                </div>
              )}
              {hoveredDot.title && (
                <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--fs-body)", fontWeight: 500, color: "var(--text)", lineHeight: "var(--lh-tight)" }}>
                  {hoveredDot.title}
                </div>
              )}
              {(hoveredDot.net != null || hoveredDot.value) && (
                <div className="tnum" style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                  {hoveredDot.net != null && (
                    <span style={{ fontSize: "var(--fs-meta)", fontWeight: 600, color: "var(--text)" }}>
                      {formatMoney(hoveredDot.net, displayCurrency, displayCurrency)}
                    </span>
                  )}
                  {hoveredDot.value && (
                    <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-dim)" }}>{hoveredDot.value}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Time frame + range picker on ONE line: the window-start date (left) and
          "Now" (right) flank a compact, centred range selector. The dates appear
          only once there's real history (showLabels); the picker is always present
          so the range stays switchable even on a cold start / while loading. The
          selected range keeps a small soft chip so the choice stays obvious. */}
      <div
        style={{
          display: "grid",
          // minmax(0,1fr) | auto | minmax(0,1fr) keeps the pill bar centred while
          // letting the side columns shrink below their content — so on a narrow
          // phone the row never overflows and pushes "Now" past the right edge.
          // "Jan '21" pins left, "Now" pins right, both flush with the graph edges.
          gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
          alignItems: "center",
          gap: 8,
          marginTop: 8,
        }}
      >
        <span style={{ minWidth: 0, fontFamily: "var(--font-numeric)", fontSize: "var(--fs-micro)", color: "var(--text-faint)", lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {showLabels ? formatXLabel(displaySeries[0].date, range) : ""}
        </span>

        <div style={{ display: "flex", justifyContent: "center" }}>
          {/* One rounded segmented bar holds all the range pills; the active one
              raises onto a soft chip (the redesign mockup idiom). */}
          <div style={{ display: "inline-flex", gap: 2, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-pill)", padding: 3 }}>
          {RANGES.map((r) => {
            const start = rangeStartDate(r);
            // 1D is intraday-liquid only: enabled purely by liquidOnly, never
            // gated by trackingSinceDate. Every other range keeps the
            // history-coverage gate.
            const disabled = r === "1D"
              ? !liquidOnly
              : trackingSinceDate != null && start != null && start < trackingSinceDate;
            const active = range === r;
            return (
              <button
                key={r}
                disabled={disabled}
                onClick={() => { if (!disabled) onRangeChange(r); }}
                aria-pressed={active}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 30,
                  padding: 0,
                  background: "none",
                  border: "none",
                  cursor: disabled ? "default" : "pointer",
                  opacity: disabled ? 0.45 : 1,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-numeric)",
                    fontSize: "var(--fs-micro)",
                    fontWeight: active ? 600 : 500,
                    lineHeight: 1,
                    padding: "5px 7px",
                    borderRadius: "var(--radius-pill)",
                    color: disabled ? "var(--text-faint)" : active ? "var(--accent-text)" : "var(--text-dim)",
                    background: active ? "var(--surface-elev)" : "transparent",
                    whiteSpace: "nowrap",
                    transition: "all 0.15s",
                  }}
                >
                  {r}
                </span>
              </button>
            );
          })}
          </div>
        </div>

        {/* "Now" jumps the hero back to today's live value (clears any scrub). */}
        <button
          type="button"
          onClick={() => { if (displaySeries.length >= 2) setSelectedIndex(displaySeries.length - 1); }}
          aria-label="Go to today"
          style={{
            // Padding enlarges the tap target; the negative margin keeps the row
            // height unchanged so the layout doesn't shift.
            justifySelf: "end", background: "none", border: "none", padding: "8px 0 8px 14px", margin: "-8px 0",
            cursor: showLabels ? "pointer" : "default",
            fontFamily: "var(--font-numeric)", fontSize: "var(--fs-micro)",
            color: selectedIndex === displaySeries.length - 1 ? "var(--accent-text)" : "var(--text-dim)",
            lineHeight: 1, whiteSpace: "nowrap", transition: "color 0.15s",
          }}
        >
          {showLabels ? "Now" : ""}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useDisplayCurrencyState } from "@/lib/hooks";
import { useChartHaptic } from "@/hooks/useChartHaptic";
import { getUsdRate, SUPPORTED_CURRENCIES, formatMoney, type DisplayCurrency } from "@/lib/money";
import { convertCurrency } from "@/lib/currency-convert";
import { formatDate } from "@/lib/utils";
import { categoryBreakdown, CATEGORY_COLOR, CATEGORY_LABEL_SHORT, STACK_ORDER, type Category } from "@/lib/categories";
import { computeYAxisDomain, computeNiceLevels } from "@/lib/networth-axis";

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
}

const CURRENCY_SYMBOL: Record<string, string> = {
  EUR: "€", USD: "$", GBP: "£", CHF: "Fr.", JPY: "¥", AUD: "A$", CAD: "C$",
};

function fmtYLabel(value: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency] ?? currency;
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(n);
  if (abs >= 1_000_000) return `${sign}${sym}${fmt(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}${sym}${fmt(abs / 1_000)}K`;
  return `${sign}${sym}${new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(abs)}`;
}

const CHART_PAD_TOP = 6;
const CHART_PAD_RIGHT = 8;   // room for end-point halo (r=6) to sit inside the viewBox
const CHART_PAD_BOTTOM = 8;  // same — prevents clipping when current value is near niceMin

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
  const haptic = useChartHaptic();
  const { currency: displayCurrency } = useDisplayCurrencyState();
  const [chartWidth, setChartWidth] = useState(280);
  const svgContainerRef = useRef<HTMLDivElement>(null);

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
  const H = 140;

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
  const strokeColor = up ? "var(--accent)" : "var(--negative)";

  // `realPointCount`/`trackingSinceDate` are derived from the FULL snapshot
  // history (not the range-clipped display series) — so the marker reflects a
  // genuine track-from-today cold start, never "this bounded window happens to
  // be narrower than the data it's clipped from".
  const realCount = realPointCount ?? displaySeries.length;
  const showSingleMarker = !loading && realCount < 2;
  const showLabels = !showSingleMarker && !loading && displaySeries.length >= 2;
  const interactive = !showSingleMarker && !loading && displaySeries.length >= 2;
  const currentValue = converted.length > 0 ? converted[converted.length - 1].total_value : null;

  // Y domain fits the visible (range-clipped) series — recomputed on every
  // range switch, so 1W zooms tight to that week's band and All spans the
  // full history, rather than always stretching from 0 to the all-time max.
  const { niceMin, niceMax, labels: yLabels } = useMemo(() => {
    const dataMin = values.length >= 2 ? Math.min(...values) : 0;
    const dataMax = values.length >= 2 ? Math.max(...values) : 1;
    // Liquid line zooms to its own min..max like a price chart; the stacked-area
    // domain anchors at 0 (needed so bands aren't clipped), which would flatten
    // a single line — so override to a padded data band in lineOnly mode.
    if (lineOnly) {
      const pad = Math.max((dataMax - dataMin) * 0.08, 1);
      return computeNiceLevels(dataMin - pad, dataMax + pad);
    }
    return computeYAxisDomain(dataMin, dataMax);
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

  const chartHandlers = interactive
    ? {
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
      }
    : {};

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

  return (
    <div>
      {/* Chart area: SVG + Y-axis label column */}
      <div style={{ display: "flex", alignItems: "stretch", height: H }}>

        {/* Chart SVG — interaction target; handlers attached here so getBoundingClientRect covers only the curve area */}
        <div
          ref={svgContainerRef}
          style={{ flex: 1, position: "relative", touchAction: interactive ? "none" : undefined }}
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
                <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--text-dim)", fontFeatureSettings: '"tnum" 1' }}>
                  {fmtYLabel(currentValue, displayCurrency)}
                </div>
              )}
              <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-faint)" }}>
                Tracking since {formatDate(trackingSinceDate ?? new Date().toISOString().slice(0, 10))}
              </div>
            </div>
          ) : loading ? (
            <div style={{ height: H }} />
          ) : (
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              width="100%"
              height={H}
              style={{ display: "block" }}
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
              <path
                d={line}
                fill="none"
                stroke={strokeColor}
                strokeWidth={1}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Static end-point marker — hidden while scrubbing a non-last point */}
              {showEndMarker && (
                <>
                  <circle cx={drawW} cy={lastY} r={6} fill="none" stroke={strokeColor} strokeOpacity={0.25} />
                  <circle cx={drawW} cy={lastY} r={3} fill={strokeColor} />
                </>
              )}
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
          {!lineOnly && selectedIndex !== null && selectedX !== null && tooltipSegments.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: 4,
                ...(flipTooltipLeft ? { right: W - selectedX + 8 } : { left: selectedX + 8 }),
                width: TOOLTIP_WIDTH,
                background: "var(--surface)",
                border: "0.5px solid var(--border)",
                borderRadius: 8,
                boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                padding: "8px 10px",
                pointerEvents: "none",
                zIndex: 2,
              }}
            >
              {tooltipSegments.map(({ category, value }) => (
                <div key={category} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: CATEGORY_COLOR[category], flexShrink: 0, display: "inline-block" }} />
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                      {CATEGORY_LABEL_SHORT[category]}
                    </span>
                  </div>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text)", fontFeatureSettings: '"tnum" 1', marginLeft: 8 }}>
                    {formatMoney(value, displayCurrency, displayCurrency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Y-axis price labels — no gridlines, IBKR-style */}
        {showLabels && (
          <div style={{ width: 40, position: "relative" }}>
            {yLabels.map((value) => (
              <div
                key={value}
                style={{
                  position: "absolute",
                  top: `${(1 - (value - niceMin) / (niceMax - niceMin)) * 100}%`,
                  transform: "translateY(-50%)",
                  right: 0,
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--text-faint)",
                  textAlign: "right",
                  lineHeight: 1,
                  pointerEvents: "none",
                }}
              >
                {fmtYLabel(value, displayCurrency)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Range pills */}
      <div
        className="flex gap-1 mt-2"
        style={{ padding: 3, borderRadius: 8, marginRight: 40 }}
      >
        {RANGES.map((r) => {
          const start = rangeStartDate(r);
          // 1D is intraday-liquid only: enabled purely by liquidOnly, never
          // gated by trackingSinceDate. Every other range keeps the
          // history-coverage gate.
          const disabled = r === "1D"
            ? !liquidOnly
            : trackingSinceDate != null && start != null && start < trackingSinceDate;
          return (
          <button
            key={r}
            disabled={disabled}
            onClick={() => { if (!disabled) onRangeChange(r); }}
            className="flex-1 text-center"
            style={{
              padding: "5px 0",
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 6,
              color: disabled ? "var(--text-faint)" : range === r ? "var(--text)" : "var(--text-dim)",
              background: range === r ? "var(--surface-elev)" : "transparent",
              boxShadow: range === r ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              border: "none",
              cursor: disabled ? "default" : "pointer",
              opacity: disabled ? 0.45 : 1,
              transition: "all 0.15s",
            }}
          >
            {r}
          </button>
          );
        })}
      </div>
    </div>
  );
}

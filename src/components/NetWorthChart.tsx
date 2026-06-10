"use client";

import { useState, useEffect, useRef } from "react";
import { useDisplayCurrencyState } from "@/lib/hooks";
import { useChartHaptic } from "@/hooks/useChartHaptic";
import { getUsdRate, type DisplayCurrency } from "@/lib/money";
import { convertCurrency } from "@/lib/currency-convert";
import { formatDate } from "@/lib/utils";

export const RANGES = ["1W", "1M", "3M", "1Y", "3Y", "All"] as const;
export type Range = (typeof RANGES)[number];

// Mirrors the snapshots route's RANGE_DAYS — used to tell whether a timeframe's
// start predates the earliest real data we have (in which case stretching a
// handful of points across that whole width would misrepresent the history).
const RANGE_WINDOW_DAYS: Record<Range, number | null> = {
  "1W": 7, "1M": 30, "3M": 90, "1Y": 365, "3Y": 1095, "All": null,
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
  // Historical USD→{display currency} rates for THIS row's own date — the same
  // basis `total_value` was stored with (see /api/snapshots). Converting with
  // these (rather than today's rate) is what makes a same-currency asset cancel
  // back to its native value across its whole history. Absent on synthesized
  // points (e.g. today's live tip), which fall back to the current rate.
  fx?: Partial<Record<DisplayCurrency, number>>;
}

// Converts a single stored point's total_value to the display currency.
// Prefers native_breakdown (direct native→display cross-rate per currency,
// identity for the home-currency bucket); falls back to total_value × the
// row's historical fx rate (or the current rate) when native_breakdown is
// absent or a needed cross-rate is missing. The live "today" tip carries
// neither field — its total_value is the live net worth already converted to
// the display currency by useNetWorth, so it's returned unchanged.
export function convertPointToDisplay(
  p: SnapshotPoint,
  displayCurrency: DisplayCurrency,
  displayRate: number,
): number {
  const today = new Date().toISOString().slice(0, 10);
  if (p.date === today) return p.total_value;

  if (p.native_breakdown) {
    let total = 0;
    let ok = true;
    for (const [cur, amt] of Object.entries(p.native_breakdown)) {
      const converted = convertCurrency(amt, cur, displayCurrency, p.fx ?? {});
      if (converted == null) { ok = false; break; }
      total += converted;
    }
    if (ok) return total;
  }

  const rate = displayCurrency === "USD" ? 1 : (p.fx?.[displayCurrency] ?? displayRate);
  return p.total_value * rate;
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

interface NiceLevels {
  niceMin: number;
  niceMax: number;
  labels: number[];
}

function computeNiceLevels(dataMin: number, dataMax: number): NiceLevels {
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

// Fits the y-axis to the visible (range-clipped) series rather than always
// spanning 0..max — so 1W zooms tight to that week's band and All spans the
// full history. Pads ~8% of the data span above and below so the line never
// sits flush against an edge, then nice-rounds the bounds to clean values.
// Near-flat windows (min ≈ max) get a minimum span centered on the value so
// the line reads as a calm flat band, not as exaggerated noise blown up from
// a near-zero data range.
function computeYAxisDomain(dataMin: number, dataMax: number): NiceLevels {
  const mid = (dataMin + dataMax) / 2;
  const span = dataMax - dataMin;
  const minSpan = Math.max(Math.abs(mid) * 0.04, 1);
  const effMin = span < minSpan ? mid - minSpan / 2 : dataMin;
  const effMax = span < minSpan ? mid + minSpan / 2 : dataMax;
  const pad = (effMax - effMin) * 0.08;
  // Never let the y-axis dip below zero when all data is non-negative.
  const rawMin = effMin - pad;
  return computeNiceLevels(dataMin >= 0 ? Math.max(0, rawMin) : rawMin, effMax + pad);
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

export function buildSeries(raw: SnapshotPoint[], currentNet: number): SnapshotPoint[] {
  const today = new Date().toISOString().slice(0, 10);
  const filtered = raw.filter((p) => p.date !== today);
  filtered.push({ date: today, total_value: currentNet });
  return filtered;
}

export function NetWorthChart(props: Props) {
  const { range, onRangeChange, series, loading, valuesSettled, realPointCount, trackingSinceDate } = props;
  // Strip the live tip (last point = today's netTotal) until values are fully settled,
  // so the chart doesn't redraw as netTotal steps through intermediate states.
  const displaySeries = valuesSettled ? series : series.slice(0, -1);
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
    const displayRate = getUsdRate(displayCurrency);
    props.onSelectPoint?.({ ...raw, total_value: convertPointToDisplay(raw, displayCurrency, displayRate) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  const W = chartWidth;
  const H = 140;

  // Convert all series values to display currency so the axis and curve are in
  // the same unit as the hero number above the chart. Each row's native_breakdown
  // converts directly per currency (identity for the home-currency bucket — no
  // FX, no drift); rows without it fall back to total_value × the row's own
  // historical fx rate, which still cancels back to native for a same-currency
  // asset. The synthesized "today" tip is the live net worth already converted
  // to the display currency by useNetWorth — returned unchanged.
  const displayRate = getUsdRate(displayCurrency);
  const converted = displaySeries.map((p) => ({
    ...p,
    total_value: convertPointToDisplay(p, displayCurrency, displayRate),
  }));

  const values = converted.map((p) => p.total_value);
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
  const dataMin = values.length >= 2 ? Math.min(...values) : 0;
  const dataMax = values.length >= 2 ? Math.max(...values) : 1;
  const { niceMin, niceMax, labels: yLabels } = computeYAxisDomain(dataMin, dataMax);

  const drawW = W - CHART_PAD_RIGHT;
  const projectY = makeProjectY(H, niceMin, niceMax);
  const { line } = buildPath(values, W, H, niceMin, niceMax, drawW);

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
                <div style={{ fontSize: 13, color: "var(--text-dim)", fontFeatureSettings: '"tnum" 1' }}>
                  {fmtYLabel(currentValue, displayCurrency)}
                </div>
              )}
              <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
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
              <path
                d={line}
                fill="none"
                stroke={strokeColor}
                strokeWidth={1.5}
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
          const disabled = trackingSinceDate != null && start != null && start < trackingSinceDate;
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

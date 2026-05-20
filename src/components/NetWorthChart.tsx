"use client";

import { useState, useEffect, useRef } from "react";
import { useDisplayCurrencyState } from "@/lib/hooks";
import { getUsdRate } from "@/lib/money";

export const RANGES = ["1W", "1M", "3M", "1Y", "3Y", "All"] as const;
export type Range = (typeof RANGES)[number];

export interface SnapshotPoint {
  date: string;
  total_value: number;
}

interface Props {
  range: Range;
  onRangeChange: (r: Range) => void;
  series: SnapshotPoint[];
  loading: boolean;
  onSelectPoint?: (point: SnapshotPoint | null) => void;
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

const CHART_PAD_TOP = 6;
const CHART_PAD_RIGHT = 8;   // room for end-point halo (r=6) to sit inside the viewBox
const CHART_PAD_BOTTOM = 8;  // same — prevents clipping when current value is near niceMin

function buildPath(
  values: number[], W: number, H: number, yMin: number, yMax: number, drawW: number
): { line: string; area: string; projectY: (v: number) => number } {
  const projectY = makeProjectY(H, yMin, yMax);

  if (values.length < 2) return { line: "", area: "", projectY };

  const toX = (i: number) => (i / (values.length - 1)) * drawW;
  const pts = values.map((c, i) => ({ x: toX(i), y: projectY(c) }));
  let line = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    line += ` L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`;
  }

  const area = line + ` L ${pts[pts.length - 1].x.toFixed(2)} ${H} L 0 ${H} Z`;

  return { line, area, projectY };
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
  const { range, onRangeChange, series, loading } = props;
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
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

  // Propagate selection to parent whenever index changes
  useEffect(() => {
    props.onSelectPoint?.(
      selectedIndex !== null ? (series[selectedIndex] ?? null) : null
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  const W = chartWidth;
  const H = 140;

  // Convert all series values to display currency so the axis and curve are in
  // the same unit as the hero number above the chart.
  const displayRate = getUsdRate(displayCurrency);
  const converted = series.map((p) => ({ ...p, total_value: p.total_value * displayRate }));

  const values = converted.map((p) => p.total_value);
  const up = converted.length >= 2 && converted[converted.length - 1].total_value >= converted[0].total_value;
  const strokeColor = up ? "var(--accent)" : "var(--negative)";
  const gradId = "netWorthChartFill";

  // Nice Y-axis bounds — shared by the curve projection, end-point marker, and label positions.
  // rawMin * 0.9 prevents the floor from collapsing to 0 when the data range far exceeds the minimum.
  const rawMin = values.length >= 2 ? Math.min(...values) : 0;
  const rawMax = values.length >= 2 ? Math.max(...values) : 1;
  const pad = (rawMax - rawMin) * 0.05;
  const dataMin = Math.max(rawMin - pad, rawMin * 0.9);
  const dataMax = rawMax + pad;
  const { niceMin, niceMax, labels: yLabels } = computeNiceLevels(dataMin, dataMax);
  const yRange = Math.max(niceMax - niceMin, 1);

  const drawW = W - CHART_PAD_RIGHT;
  const { line, area, projectY } = buildPath(values, W, H, niceMin, niceMax, drawW);

  const lastY = values.length >= 2 ? projectY(values[values.length - 1]) : H / 2;

  // Scrub marker — same projection as buildPath / lastY
  const selectedX =
    selectedIndex !== null && series.length >= 2
      ? (selectedIndex / (series.length - 1)) * drawW
      : null;
  const selectedY =
    selectedIndex !== null && values.length >= 2
      ? projectY(values[selectedIndex])
      : null;

  const showEndMarker = selectedIndex === null || selectedIndex === series.length - 1;

  const showEmpty = !loading && series.length < 2;
  const showLabels = !showEmpty && !loading && series.length >= 2;
  const interactive = !loading && series.length >= 2;

  function calcIndex(clientX: number, rect: DOMRect): number {
    const relX = (clientX - rect.left) / rect.width;
    return Math.min(Math.max(Math.round(relX * (series.length - 1)), 0), series.length - 1);
  }

  const chartHandlers = interactive
    ? {
        onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
          setSelectedIndex(calcIndex(e.clientX, e.currentTarget.getBoundingClientRect()));
        },
        onMouseLeave() { setSelectedIndex(null); },
        onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
          setSelectedIndex(calcIndex(e.touches[0].clientX, e.currentTarget.getBoundingClientRect()));
        },
        onTouchMove(e: React.TouchEvent<HTMLDivElement>) {
          setSelectedIndex(calcIndex(e.touches[0].clientX, e.currentTarget.getBoundingClientRect()));
        },
        onTouchEnd() { setSelectedIndex(null); },
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
          {showEmpty ? (
            <div
              style={{
                height: H,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 6,
              }}
            >
              <div style={{ fontSize: 11, color: "var(--text-faint)" }}>Day one</div>
              <div style={{ fontSize: 10, color: "var(--text-faint)", textAlign: "center", maxWidth: 280, lineHeight: 1.5 }}>
                Volnar logs your net worth daily. Your trajectory will plot here as snapshots accumulate.
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
              <defs>
                <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <path d={area} fill={`url(#${gradId})`} />
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
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => onRangeChange(r)}
            className="flex-1 text-center"
            style={{
              padding: "5px 0",
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 6,
              color: range === r ? "var(--text)" : "var(--text-dim)",
              background: range === r ? "var(--surface-elev)" : "transparent",
              boxShadow: range === r ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

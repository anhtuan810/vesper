"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePriceHistory, useIntradayPrices } from "@/lib/hooks";
import { useDisplayCurrencyState } from "@/lib/hooks";
import { useChartHaptic } from "@/hooks/useChartHaptic";

export const RANGES = ["1D", "1W", "1M", "3M", "1Y", "3Y"] as const;
export type Range = (typeof RANGES)[number];

export interface ScrubInfo {
  ratio: number;   // closes[i] / closes[last] — multiply by livePrice to get approx EUR
  pct: number;     // % change from period start to this point
  label: string;   // formatted time/date label
}

interface PriceChartProps {
  symbol: string;
  defaultRange?: Range;
  onPeriodChange?: (pct: number | null, range: Range, label: string) => void;
  onScrub?: (info: ScrubInfo | null) => void;
}

const CURRENCY_SYMBOL: Record<string, string> = {
  EUR: "€", USD: "$", GBP: "£", CHF: "Fr.", JPY: "¥", AUD: "A$", CAD: "C$",
};

function fmtYLabel(value: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency] ?? currency;
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  const fmt = (n: number) =>
    new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(n);
  if (abs >= 1_000_000) return `${sign}${sym}${fmt(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}${sym}${fmt(abs / 1_000)}K`;
  return `${sign}${sym}${new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(abs)}`;
}

interface NiceLevels { niceMin: number; niceMax: number; labels: number[] }

function computeNiceLevels(dataMin: number, dataMax: number): NiceLevels {
  const range = dataMax - dataMin;
  if (range === 0) {
    const step = Math.max(Math.abs(dataMax) * 0.1, 1);
    return { niceMin: dataMax - step, niceMax: dataMax + step, labels: [dataMax - step, dataMax, dataMax + step] };
  }
  const rawBase = Math.pow(10, Math.floor(Math.log10(range)));
  const mults = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];
  for (const m of mults) {
    const step = rawBase * m;
    const niceMin = Math.floor(dataMin / step) * step;
    let niceMax = Math.ceil(dataMax / step) * step;
    if (niceMax <= dataMax) niceMax += step;
    const count = Math.round((niceMax - niceMin) / step) + 1;
    if (count >= 4 && count <= 5) {
      const labels: number[] = [];
      for (let i = 0; i < count; i++) labels.push(niceMin + i * step);
      return { niceMin, niceMax, labels };
    }
  }
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

// totalPoints controls the full X span (for 1D: full trading day; others: data length)
function buildPath(
  values: number[], totalPoints: number,
  W: number, H: number, yMin: number, yMax: number
): { line: string; area: string } {
  if (values.length < 2) return { line: "", area: "" };
  const yRange = Math.max(yMax - yMin, 1);
  const n = Math.max(totalPoints - 1, values.length - 1);
  const toX = (i: number) => (i / n) * W;
  const toY = (v: number) => H - ((v - yMin) / yRange) * H;
  const pts = values.map((c, i) => ({ x: toX(i), y: toY(c) }));
  // Straight segments (no smoothing) to match the portfolio net-worth chart.
  let line = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    line += ` L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`;
  }
  const lastPt = pts[pts.length - 1];
  // Area closes down from the last point to the baseline and back to the start.
  const area = line + ` L ${lastPt.x.toFixed(2)} ${H} L 0 ${H} Z`;
  return { line, area };
}

const RANGE_LABEL: Record<Range, string> = {
  "1D": "today", "1W": "past week", "1M": "past month",
  "3M": "past 3 months", "1Y": "past year", "3Y": "past 3 years",
};

function periodLabel(range: Range, timestamps: number[]): string {
  if (range !== "1D") return RANGE_LABEL[range];
  const lastTs = timestamps[timestamps.length - 1];
  if (!lastTs) return RANGE_LABEL["1D"];
  const d = new Date(lastTs * 1000);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) return "today";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function fmtScrubLabel(timestamp: number, range: Range): string {
  const d = new Date(timestamp * 1000);
  if (range === "1D") {
    // Full weekday + date + local time, matching the portfolio hero's 1D scrub.
    return d.toLocaleString("en-GB", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }
  return d.toLocaleDateString("en-GB", {
    day: "numeric", month: "short",
    year: range === "3Y" ? "numeric" : undefined,
  });
}

export function PriceChart({ symbol, defaultRange = "1M", onPeriodChange, onScrub }: PriceChartProps) {
  const router = useRouter();
  const [range, setRange] = useState<Range>(defaultRange);
  const { currency: displayCurrency } = useDisplayCurrencyState();
  const [chartWidth, setChartWidth] = useState(320);
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const r = new URLSearchParams(window.location.search).get("range") ?? "";
    if ((RANGES as readonly string[]).includes(r)) setRange(r as Range); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  // 1D uses the intraday source (previous-close baseline, like the portfolio
  // liquid chart); other ranges use the standard history. Only one fetches at a
  // time — usePriceHistory is fed a null symbol when intraday is active.
  const isIntraday = range === "1D";
  const history = usePriceHistory(isIntraday ? null : symbol, range);
  const intraday = useIntradayPrices(symbol, isIntraday);
  const { closes, timestamps, loading } = isIntraday ? intraday : history;

  // Line fills the full width (last point at the right edge) for every range,
  // matching the portfolio chart.
  const totalPoints = closes.length;
  const n = Math.max(totalPoints - 1, 1);

  const W = chartWidth;
  const H = 140;
  const gradId = `chartFill_${symbol.replace(/[^a-zA-Z0-9]/g, "")}`;

  // Memoized: scrubbing re-renders on every pointer move via setSelectedIndex,
  // and rebuilding the min/max scan, nice levels, and SVG path strings for
  // hundreds of points per frame makes touch-scrub janky on device.
  const { niceMin, niceMax, labels: yLabels } = useMemo(() => {
    const dataMin = closes.length >= 2 ? Math.min(...closes) : 0;
    const dataMax = closes.length >= 2 ? Math.max(...closes) : 1;
    // Pad by 8% of the data range (matches the portfolio net-worth chart's
    // lineOnly zoom) rather than a fixed ±3% of price.
    const pad = Math.max((dataMax - dataMin) * 0.08, 1);
    return computeNiceLevels(dataMin - pad, dataMax + pad);
  }, [closes]);
  const yRange = Math.max(niceMax - niceMin, 1);

  const up = closes.length >= 2 && closes[closes.length - 1] >= closes[0];
  const strokeColor = up ? "var(--accent)" : "var(--negative)";

  const { line, area } = useMemo(
    () => buildPath(closes, totalPoints, W, H, niceMin, niceMax),
    [closes, totalPoints, W, H, niceMin, niceMax],
  );

  // End marker sits at the last actual data point (may be left of right edge for 1D)
  const lastX = closes.length >= 2 ? ((closes.length - 1) / n) * W : W;
  const lastY = closes.length >= 2
    ? H - ((closes[closes.length - 1] - niceMin) / yRange) * H
    : H / 2;

  const showEmpty = !loading && closes.length < 2;
  const showLabels = !showEmpty && !loading && closes.length >= 2;
  const interactive = !loading && closes.length >= 2;

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const haptic = useChartHaptic();

  useEffect(() => {
    setSelectedIndex(null); // eslint-disable-line react-hooks/set-state-in-effect
  }, [closes]);

  // Report period change whenever data or range changes
  useEffect(() => {
    if (!onPeriodChange) return;
    const label = periodLabel(range, timestamps);
    if (closes.length >= 2 && closes[0] !== 0) {
      const pct = ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100;
      onPeriodChange(pct, range, label);
    } else {
      onPeriodChange(null, range, label);
    }
  }, [closes, range, timestamps]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedX = selectedIndex !== null && closes.length >= 2
    ? (selectedIndex / n) * W
    : null;
  const selectedY = selectedIndex !== null && closes.length >= 2
    ? H - ((closes[selectedIndex] - niceMin) / yRange) * H
    : null;
  const showEndMarker = selectedIndex === null || selectedIndex === closes.length - 1;

  function calcIndex(clientX: number, rect: DOMRect): number {
    const relX = (clientX - rect.left) / rect.width;
    return Math.min(Math.max(Math.round(relX * n), 0), closes.length - 1);
  }

  function applyScrub(index: number) {
    setSelectedIndex(index);
    if (onScrub && closes.length >= 2 && closes[0] !== 0) {
      const lastClose = closes[closes.length - 1];
      const scrubClose = closes[index];
      onScrub({
        ratio: lastClose !== 0 ? scrubClose / lastClose : 1,
        pct: ((scrubClose - closes[0]) / closes[0]) * 100,
        label: timestamps[index] ? fmtScrubLabel(timestamps[index], range) : "",
      });
    }
    haptic(index);
  }

  function clearScrub() {
    setSelectedIndex(null);
    onScrub?.(null);
    haptic(null);
  }

  const chartHandlers = interactive
    ? {
        onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
          applyScrub(calcIndex(e.clientX, e.currentTarget.getBoundingClientRect()));
        },
        onMouseLeave() { clearScrub(); },
        onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
          applyScrub(calcIndex(e.touches[0].clientX, e.currentTarget.getBoundingClientRect()));
        },
        onTouchMove(e: React.TouchEvent<HTMLDivElement>) {
          applyScrub(calcIndex(e.touches[0].clientX, e.currentTarget.getBoundingClientRect()));
        },
        onTouchEnd() { clearScrub(); },
      }
    : {};

  function selectRange(r: Range) {
    setRange(r);
    const params = new URLSearchParams(window.location.search);
    params.set("range", r);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div>
      {/* Chart area: SVG + Y-axis label column */}
      <div style={{ display: "flex", alignItems: "stretch", height: H }}>

        {/* Chart SVG — interaction target */}
        <div
          ref={svgContainerRef}
          style={{ flex: 1, position: "relative", touchAction: interactive ? "none" : undefined }}
          {...chartHandlers}
        >
          {showEmpty ? (
            <div style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: "var(--fs-micro)", color: "var(--text-faint)" }}>No data</div>
            </div>
          ) : loading ? (
            <div style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: "var(--fs-micro)", color: "var(--text-faint)", letterSpacing: "var(--tracking-label)", fontFamily: "var(--font-ui)" }}>
                loading
              </div>
            </div>
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
                  <stop offset="0%" stopColor={strokeColor} stopOpacity={0.16} />
                  <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <path d={area} fill={`url(#${gradId})`} />
              <path
                d={line}
                fill="none"
                stroke={strokeColor}
                strokeWidth={1}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {showEndMarker && (
                <>
                  <circle cx={lastX} cy={lastY} r={6} fill="none" stroke={strokeColor} strokeOpacity={0.25} />
                  <circle cx={lastX} cy={lastY} r={3} fill={strokeColor} />
                </>
              )}
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

        {/* Y-axis price labels */}
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
                  fontFamily: "var(--font-numeric)",
                  fontSize: "var(--fs-micro)",
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

      {/* Range pills — one rounded segmented bar (matches the Overview chart) */}
      <div
        className="flex gap-0.5 mt-2"
        style={{ padding: 3, borderRadius: "var(--radius-pill)", marginRight: 40, background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => selectRange(r)}
            className="flex-1 text-center"
            style={{
              padding: "5px 0",
              fontSize: "var(--fs-caption)",
              fontWeight: range === r ? 600 : 500,
              borderRadius: "var(--radius-pill)",
              color: range === r ? "var(--accent-text)" : "var(--text-dim)",
              background: range === r ? "var(--surface-elev)" : "transparent",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s",
              fontFamily: "var(--font-ui)",
            }}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

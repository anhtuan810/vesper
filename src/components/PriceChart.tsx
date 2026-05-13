"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePriceHistory } from "@/lib/hooks";
import { useDisplayCurrencyState } from "@/lib/hooks";

const RANGES = ["1W", "1M", "3M", "1Y", "All"] as const;
type Range = (typeof RANGES)[number];

interface PriceChartProps {
  symbol: string;
  defaultRange?: Range;
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

function buildPath(
  values: number[], W: number, H: number, yMin: number, yMax: number
): { line: string; area: string } {
  if (values.length < 2) return { line: "", area: "" };
  const yRange = Math.max(yMax - yMin, 1);
  const toX = (i: number) => (i / (values.length - 1)) * W;
  const toY = (v: number) => H - ((v - yMin) / yRange) * H;
  const pts = values.map((c, i) => ({ x: toX(i), y: toY(c) }));
  let line = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const mx = ((pts[i].x + pts[i + 1].x) / 2).toFixed(2);
    const my = ((pts[i].y + pts[i + 1].y) / 2).toFixed(2);
    line += ` Q ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)} ${mx} ${my}`;
  }
  line += ` L ${pts[pts.length - 1].x.toFixed(2)} ${pts[pts.length - 1].y.toFixed(2)}`;
  const area = line + ` L ${pts[pts.length - 1].x.toFixed(2)} ${H} L 0 ${H} Z`;
  return { line, area };
}

export function PriceChart({ symbol, defaultRange = "1M" }: PriceChartProps) {
  const router = useRouter();
  const [range, setRange] = useState<Range>(defaultRange);
  const { currency: displayCurrency } = useDisplayCurrencyState();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const r = new URLSearchParams(window.location.search).get("range") ?? "";
    if ((RANGES as readonly string[]).includes(r)) setRange(r as Range); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  const { closes, loading } = usePriceHistory(symbol, range);

  const W = 320;
  const H = 140;
  const gradId = `chartFill_${symbol.replace(/[^a-zA-Z0-9]/g, "")}`;

  const dataMin = closes.length >= 2 ? Math.min(...closes) : 0;
  const dataMax = closes.length >= 2 ? Math.max(...closes) : 1;
  const { niceMin, niceMax, labels: yLabels } = computeNiceLevels(dataMin, dataMax);
  const yRange = Math.max(niceMax - niceMin, 1);

  const up = closes.length >= 2 && closes[closes.length - 1] >= closes[0];
  const strokeColor = up ? "var(--accent)" : "var(--negative)";

  const { line, area } = buildPath(closes, W, H, niceMin, niceMax);

  const lastY =
    closes.length >= 2
      ? H - ((closes[closes.length - 1] - niceMin) / yRange) * H
      : H / 2;

  const showEmpty = !loading && closes.length < 2;
  const showLabels = !showEmpty && !loading && closes.length >= 2;
  const interactive = !loading && closes.length >= 2;

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    setSelectedIndex(null); // eslint-disable-line react-hooks/set-state-in-effect
  }, [closes]);

  const selectedX =
    selectedIndex !== null && closes.length >= 2
      ? (selectedIndex / (closes.length - 1)) * W
      : null;
  const selectedY =
    selectedIndex !== null && closes.length >= 2
      ? H - ((closes[selectedIndex] - niceMin) / yRange) * H
      : null;
  const showEndMarker = selectedIndex === null || selectedIndex === closes.length - 1;

  function calcIndex(clientX: number, rect: DOMRect): number {
    const relX = (clientX - rect.left) / rect.width;
    return Math.min(Math.max(Math.round(relX * (closes.length - 1)), 0), closes.length - 1);
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
          style={{ flex: 1, position: "relative", touchAction: interactive ? "none" : undefined }}
          {...chartHandlers}
        >
          {showEmpty ? (
            <div style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-faint)" }}>No data</div>
            </div>
          ) : loading ? (
            <div style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.1em", fontFamily: "var(--font-sans)" }}>
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
              {showEndMarker && (
                <>
                  <circle cx={W} cy={lastY} r={6} fill="none" stroke={strokeColor} strokeOpacity={0.25} />
                  <circle cx={W} cy={lastY} r={3} fill={strokeColor} />
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
            onClick={() => selectRange(r)}
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
              fontFamily: "var(--font-sans)",
            }}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

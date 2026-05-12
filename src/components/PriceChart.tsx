"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePriceHistory, useDisplayCurrency } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";

const RANGES = ["1D", "1W", "1M", "3M", "1Y", "All"] as const;
type Range = (typeof RANGES)[number];

interface PriceChartProps {
  symbol: string;
  defaultRange?: Range;
}

function buildPath(closes: number[], W: number, H: number): { line: string; area: string } {
  if (closes.length < 2) return { line: "", area: "" };

  const pad = 4;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = Math.max(max - min, max * 0.0001);

  const toX = (i: number) => (i / (closes.length - 1)) * W;
  const toY = (v: number) => H - pad - ((v - min) / range) * (H - pad * 2);

  const pts = closes.map((c, i) => ({ x: toX(i), y: toY(c) }));
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

function fmtChartDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function PriceChart({ symbol, defaultRange = "3M" }: PriceChartProps) {
  const router = useRouter();
  const [range, setRange] = useState<Range>(defaultRange);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const r = new URLSearchParams(window.location.search).get("range") ?? "";
    if ((RANGES as readonly string[]).includes(r)) setRange(r as Range);
  }, []);

  const { closes, timestamps, loading } = usePriceHistory(symbol, range);
  const displayCurrency = useDisplayCurrency();

  const W = 320;
  const H = 90;
  const pad = 4;
  const strokeColor = "var(--accent)";
  const gradId = `chartFill_${symbol.replace(/[^a-zA-Z0-9]/g, "")}`;

  const { line, area } = buildPath(closes, W, H);

  const min = closes.length ? Math.min(...closes) : 0;
  const max = closes.length ? Math.max(...closes) : 0;
  const vRange = Math.max(max - min, max * 0.0001);
  const lastY =
    closes.length >= 2
      ? H - pad - ((closes[closes.length - 1] - min) / vRange) * (H - pad * 2)
      : H / 2;
  const firstY =
    closes.length >= 2
      ? H - pad - ((closes[0] - min) / vRange) * (H - pad * 2)
      : H / 2;

  const showEmpty = !loading && closes.length < 2;

  function selectRange(r: Range) {
    setRange(r);
    const params = new URLSearchParams(window.location.search);
    params.set("range", r);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div>
      {/* Chart SVG — flush to page surface, no card wrapper */}
      <div style={{ position: "relative", height: H }}>
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
          <>
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
              {/* End-point marker: halo + dot, matching NetWorthChart */}
              <circle cx={W} cy={lastY} r={6} fill="none" stroke={strokeColor} strokeOpacity={0.25} />
              <circle cx={W} cy={lastY} r={3} fill={strokeColor} />
            </svg>
            {/* Start value label */}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: firstY < 20 ? firstY + 5 : firstY - 17,
                fontSize: 11,
                color: "var(--text-faint)",
                fontFamily: "var(--font-sans)",
                fontFeatureSettings: '"tnum" 1',
                lineHeight: 1,
                pointerEvents: "none",
              }}
            >
              {formatMoney(closes[0], displayCurrency)}
            </div>
            {/* End value label */}
            <div
              style={{
                position: "absolute",
                right: 0,
                top: lastY < 20 ? lastY + 5 : lastY - 17,
                fontSize: 11,
                color: "var(--text-faint)",
                fontFamily: "var(--font-sans)",
                fontFeatureSettings: '"tnum" 1',
                lineHeight: 1,
                pointerEvents: "none",
              }}
            >
              {formatMoney(closes[closes.length - 1], displayCurrency)}
            </div>
          </>
        )}
      </div>

      {/* Date axis labels — below SVG, matching NetWorthChart treatment */}
      {!showEmpty && !loading && closes.length >= 2 && timestamps.length >= 2 && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
            {fmtChartDate(timestamps[0])}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
            {fmtChartDate(timestamps[timestamps.length - 1])}
          </span>
        </div>
      )}

      {/* Range pills — matching NetWorthChart: tinted track, rounded rect, not pill */}
      <div
        className="flex gap-1 mt-3"
        style={{
          padding: 4,
          background: "var(--surface-elev)",
          borderRadius: 10,
        }}
      >
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => selectRange(r)}
            className="flex-1 text-center"
            style={{
              padding: "9px 0",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 8,
              color: range === r ? "var(--text)" : "var(--text-dim)",
              background: range === r ? "var(--bg)" : "transparent",
              boxShadow: range === r ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
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

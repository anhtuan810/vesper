"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePriceHistory } from "@/lib/hooks";

const RANGES = ["1D", "1W", "1M", "3M", "1Y", "ALL"] as const;
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

  // smooth path via quadratic bezier through midpoints
  const pts = closes.map((c, i) => ({ x: toX(i), y: toY(c) }));
  let line = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const mx = ((pts[i].x + pts[i + 1].x) / 2).toFixed(2);
    const my = ((pts[i].y + pts[i + 1].y) / 2).toFixed(2);
    line += ` Q ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)} ${mx} ${my}`;
  }
  line += ` L ${pts[pts.length - 1].x.toFixed(2)} ${pts[pts.length - 1].y.toFixed(2)}`;

  const area =
    line +
    ` L ${pts[pts.length - 1].x.toFixed(2)} ${H} L 0 ${H} Z`;

  return { line, area };
}

export function PriceChart({ symbol, defaultRange = "3M" }: PriceChartProps) {
  const router = useRouter();
  const [range, setRange] = useState<Range>(defaultRange);

  // Reads window.location.search directly to avoid the Suspense requirement of useSearchParams.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const r = new URLSearchParams(window.location.search).get("range") ?? "";
    if ((RANGES as readonly string[]).includes(r)) setRange(r as Range);
  }, []);

  const { closes, loading } = usePriceHistory(symbol, range);

  const W = 280;
  const H = 110;
  const strokeColor = "var(--accent)";
  const gradId = `chartFill_${symbol.replace(/[^a-zA-Z0-9]/g, "")}`;

  const { line, area } = buildPath(closes, W, H);
  const lastPt =
    closes.length >= 2
      ? {
          x: W,
          y:
            H -
            4 -
            ((closes[closes.length - 1] - Math.min(...closes)) /
              Math.max(Math.max(...closes) - Math.min(...closes), Math.max(...closes) * 0.0001)) *
              (H - 8),
        }
      : null;

  function selectRange(r: Range) {
    setRange(r);
    const params = new URLSearchParams(window.location.search);
    params.set("range", r);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div>
      {/* Chart */}
      <div style={{ margin: "8px -6px", height: H }}>
        {loading || closes.length < 2 ? (
          <div
            style={{ width: "100%", height: H, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {loading && (
              <div
                className="font-mono text-faint"
                style={{ fontSize: 10, letterSpacing: "0.1em" }}
              >
                loading
              </div>
            )}
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            width="100%"
            height={H}
          >
            <defs>
              <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={strokeColor} stopOpacity={0.2} />
                <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* Baseline */}
            <line
              x1={0}
              y1={closes.length >= 2
                ? H - 4 - 0
                : H / 2}
              x2={W}
              y2={closes.length >= 2
                ? H - 4 - 0
                : H / 2}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            {/* Fill */}
            <path d={area} fill={`url(#${gradId})`} />
            {/* Line */}
            <path
              d={line}
              fill="none"
              stroke={strokeColor}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* End dot */}
            {lastPt && (
              <circle cx={lastPt.x} cy={lastPt.y} r={3} fill={strokeColor} />
            )}
          </svg>
        )}
      </div>

      {/* Time tabs */}
      <div
        className="flex gap-0.5"
        style={{
          margin: "14px 0 4px",
          padding: 4,
          background: "var(--surface)",
          borderRadius: 12,
          border: "1px solid var(--border)",
        }}
      >
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => selectRange(r)}
            className="flex-1 text-center font-mono"
            style={{
              padding: "7px 0",
              fontSize: 11,
              letterSpacing: "0.04em",
              borderRadius: 8,
              color: range === r ? "var(--text)" : "var(--text-dim)",
              background:
                range === r ? "var(--surface-elev)" : "transparent",
              boxShadow: range === r ? "0 1px 2px rgba(0,0,0,0.2)" : "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

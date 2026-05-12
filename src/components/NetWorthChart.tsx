"use client";

import { useState, useEffect } from "react";
import { useDisplayCurrency } from "@/lib/hooks";
import { abbreviateMoney } from "@/lib/money";

const RANGES = ["1D", "1W", "1M", "3M", "1Y", "All"] as const;
type Range = (typeof RANGES)[number];

export interface SnapshotPoint {
  date: string;
  total_value: number;
}

interface Props {
  currentNet: number;
  initialSnapshots?: SnapshotPoint[];
}

function buildPath(values: number[], W: number, H: number): { line: string; area: string } {
  if (values.length < 2) return { line: "", area: "" };

  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, max * 0.0001);

  const toX = (i: number) => (i / (values.length - 1)) * W;
  const toY = (v: number) => H - pad - ((v - min) / range) * (H - pad * 2);

  const pts = values.map((c, i) => ({ x: toX(i), y: toY(c) }));
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

function fmtChartDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function buildSeries(raw: SnapshotPoint[], currentNet: number): SnapshotPoint[] {
  const today = new Date().toISOString().slice(0, 10);
  const filtered = raw.filter((p) => p.date !== today);
  filtered.push({ date: today, total_value: currentNet });
  return filtered;
}

export function NetWorthChart({ currentNet, initialSnapshots }: Props) {
  const [range, setRange] = useState<Range>("1M");
  const [series, setSeries] = useState<SnapshotPoint[]>(
    initialSnapshots ? buildSeries(initialSnapshots, currentNet) : []
  );
  const [loading, setLoading] = useState(!initialSnapshots);
  const displayCurrency = useDisplayCurrency();

  useEffect(() => {
    // Skip the initial 1M fetch if preloaded data was provided
    if (range === "1M" && initialSnapshots && series.length > 0) return;
    setLoading(true);
    fetch(`/api/snapshots?range=${range}`)
      .then((r) => r.json())
      .then((body) => {
        setSeries(buildSeries(body.data ?? [], currentNet));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, currentNet]);

  const W = 280;
  const H = 64;
  const pad = 4;

  const values = series.map((p) => p.total_value);
  const up = series.length >= 2 && series[series.length - 1].total_value >= series[0].total_value;
  const strokeColor = up ? "var(--accent)" : "var(--negative)";
  const gradId = "netWorthChartFill";

  const { line, area } = buildPath(values, W, H);

  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const vRange = Math.max(max - min, max * 0.0001);
  const lastY =
    values.length >= 2
      ? H - pad - ((values[values.length - 1] - min) / vRange) * (H - pad * 2)
      : H / 2;
  const firstY =
    values.length >= 2
      ? H - pad - ((values[0] - min) / vRange) * (H - pad * 2)
      : H / 2;

  const showEmpty = !loading && series.length < 2;

  return (
    <div>
      {/* Chart SVG — labels rendered below, not inside, this container */}
      <div style={{ position: "relative", height: H }}>
        {showEmpty ? (
          <div
            style={{
              height: H,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: 6,
            }}
          >
            <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
              Day one
            </div>
            <div
              style={{ fontSize: 10, color: "var(--text-faint)", textAlign: "center", maxWidth: 280, lineHeight: 1.5 }}
            >
              Vesper logs your net worth daily. Your trajectory will plot here as snapshots accumulate.
            </div>
          </div>
        ) : loading ? (
          <div style={{ height: H }} />
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
              {/* Today marker: halo + dot */}
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
              {abbreviateMoney(values[0], displayCurrency)}
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
              {abbreviateMoney(values[values.length - 1], displayCurrency)}
            </div>
          </>
        )}
      </div>

      {/* Date axis labels — separate row below SVG so they never overlap the curve */}
      {!showEmpty && !loading && series.length >= 2 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 6,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
            {fmtChartDate(series[0].date)}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
            {fmtChartDate(series[series.length - 1].date)}
          </span>
        </div>
      )}

      {/* Range pills — below axis labels */}
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
            onClick={() => setRange(r)}
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
            }}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

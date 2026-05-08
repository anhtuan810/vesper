"use client";

import { useState, useEffect } from "react";

const RANGES = ["1W", "1M", "3M", "1Y", "ALL"] as const;
type Range = (typeof RANGES)[number];

interface Props {
  currentNet: number;
}

interface SnapshotPoint {
  date: string;
  total_value: number;
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

export function NetWorthChart({ currentNet }: Props) {
  const [range, setRange] = useState<Range>("1M");
  const [series, setSeries] = useState<SnapshotPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/snapshots?range=${range}`)
      .then((r) => r.json())
      .then((body) => {
        const raw: SnapshotPoint[] = body.data ?? [];
        const today = new Date().toISOString().slice(0, 10);
        const filtered = raw.filter((p) => p.date !== today);
        filtered.push({ date: today, total_value: currentNet });
        setSeries(filtered);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [range, currentNet]);

  const W = 280;
  const H = 120;
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

  const showEmpty = !loading && series.length < 7;

  return (
    <div>
      {/* Range pills */}
      <div
        className="flex gap-0.5"
        style={{
          padding: 4,
          background: "var(--surface)",
          borderRadius: 12,
          border: "1px solid var(--border)",
          marginBottom: 8,
        }}
      >
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className="flex-1 text-center font-mono"
            style={{
              padding: "7px 0",
              fontSize: 11,
              letterSpacing: "0.04em",
              borderRadius: 8,
              color: range === r ? "var(--text)" : "var(--text-dim)",
              background: range === r ? "var(--surface-elev)" : "transparent",
              boxShadow: range === r ? "0 1px 2px rgba(0,0,0,0.2)" : "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Chart area */}
      <div style={{ position: "relative", height: H }}>
        {showEmpty ? (
          <div
            style={{
              height: H,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
            }}
          >
            <div
              className="font-mono"
              style={{ fontSize: 11, color: "var(--text-faint)", letterSpacing: "0.04em" }}
            >
              Building your history
            </div>
            <div
              className="font-mono"
              style={{ fontSize: 10, color: "var(--text-faint)", textAlign: "center", maxWidth: 240 }}
            >
              Vesper logs your net worth daily. Your trend will appear here in a few days.
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
              {/* Dashed baseline at lowest value */}
              <line
                x1={0}
                y1={H - pad}
                x2={W}
                y2={H - pad}
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
              {/* Today marker: halo + dot */}
              <circle cx={W} cy={lastY} r={6} fill="none" stroke={strokeColor} strokeOpacity={0.25} />
              <circle cx={W} cy={lastY} r={3} fill={strokeColor} />
            </svg>

            {/* Date labels — rendered as HTML to avoid SVG stretch distortion */}
            <div
              style={{
                position: "absolute",
                bottom: 2,
                left: 0,
                right: 0,
                display: "flex",
                justifyContent: "space-between",
                pointerEvents: "none",
              }}
            >
              <span
                className="font-mono"
                style={{ fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.04em" }}
              >
                {series.length > 0 ? fmtChartDate(series[0].date) : ""}
              </span>
              <span
                className="font-mono"
                style={{ fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.04em" }}
              >
                {series.length > 0 ? fmtChartDate(series[series.length - 1].date) : ""}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { niceCeil, compactMoney } from "@/components/scenario/cards/chart-utils";

// Single-series growth curve (a hypothetical investment's value from buy date to
// today), in ProjectionChart's visual language. Pure presentational: the series
// arrives already in display-currency numbers — nothing is recomputed here.

export function GrowthChart({
  series,
  symbol,
}: {
  series: Array<{ t: number; v: number }>;
  symbol: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw && cw > 0) setW(Math.floor(cw));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 170;
  const PAD_TOP = 8;
  const PAD_RIGHT = 10;
  const PAD_BOTTOM = 18;
  const drawW = Math.max(10, w - PAD_RIGHT);
  const drawH = H - PAD_TOP - PAD_BOTTOM;

  if (series.length < 2) return <div style={{ height: H }} />;

  const minT = series[0].t;
  const maxT = series[series.length - 1].t;
  const xOf = (t: number) => (maxT === minT ? 0 : ((t - minT) / (maxT - minT)) * drawW);
  const yMax = niceCeil(Math.max(...series.map((p) => p.v), 1) * 1.08) || 1;
  const yOf = (v: number) => PAD_TOP + drawH - (v / yMax) * drawH;

  const path = "M " + series.map((p) => `${xOf(p.t).toFixed(1)} ${yOf(p.v).toFixed(1)}`).join(" L ");
  // Soft fill under the line.
  const area = `${path} L ${xOf(maxT).toFixed(1)} ${(PAD_TOP + drawH).toFixed(1)} L ${xOf(minT).toFixed(1)} ${(PAD_TOP + drawH).toFixed(1)} Z`;

  const yLabels = [0, yMax / 2, yMax];
  const last = series[series.length - 1];

  return (
    <div style={{ display: "flex", alignItems: "stretch", height: H }}>
      <div ref={ref} style={{ flex: 1, position: "relative" }}>
        <svg viewBox={`0 0 ${w} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: "block" }}>
          <path d={area} fill="var(--accent)" fillOpacity={0.1} />
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={xOf(last.t)} cy={yOf(last.v)} r={3} fill="var(--accent)" />
        </svg>
        <span style={{ position: "absolute", bottom: 0, left: 0, fontSize: 10, color: "var(--text-faint)" }}>
          {new Date(minT).getFullYear()}
        </span>
        <span style={{ position: "absolute", bottom: 0, right: 0, fontSize: 10, color: "var(--text-faint)" }}>today</span>
      </div>

      {/* Y-axis labels */}
      <div style={{ width: 44, position: "relative" }}>
        {yLabels.map((v) => (
          <div
            key={v}
            style={{ position: "absolute", top: `${(1 - v / yMax) * 100}%`, right: 0, transform: "translateY(-50%)", fontSize: 11, color: "var(--text-faint)", lineHeight: 1, pointerEvents: "none" }}
          >
            {compactMoney(v, symbol)}
          </div>
        ))}
      </div>
    </div>
  );
}

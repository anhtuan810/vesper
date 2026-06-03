"use client";

import { useState, useEffect, useRef } from "react";
import { niceCeil, compactMoney } from "@/components/scenario/cards/chart-utils";

// Forward-projection cone. Pure presentational: every figure arrives via props
// already in display-currency numbers — nothing is computed or projected here.
// Historical net worth as a solid line; past "today" a shaded low–high band with
// a dashed mid line, so the projection reads as estimate, not fact.

export function ProjectionChart({
  history,
  today,
  horizon,
  horizonYear,
  symbol,
}: {
  history: Array<{ t: number; v: number }>;
  today: { t: number; v: number } | null;
  horizon: { t: number; low: number; mid: number; high: number } | null;
  horizonYear: number;
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

  if (!today || !horizon) {
    return <div style={{ height: H }} />;
  }

  const minT = history.length ? Math.min(history[0].t, today.t) : today.t;
  const maxT = horizon.t;
  const xOf = (t: number) => (maxT === minT ? 0 : ((t - minT) / (maxT - minT)) * drawW);

  const yMaxRaw = Math.max(today.v, horizon.high, ...history.map((h) => h.v), 1);
  const yMax = niceCeil(yMaxRaw * 1.08) || 1;
  const yOf = (v: number) => PAD_TOP + drawH - (v / yMax) * drawH;

  const histPts = [...history.filter((h) => h.t <= today.t), today];
  const histPath = histPts.length >= 2 ? "M " + histPts.map((p) => `${xOf(p.t).toFixed(1)} ${yOf(p.v).toFixed(1)}`).join(" L ") : "";

  const xT = xOf(today.t);
  const yT = yOf(today.v);
  const xH = xOf(horizon.t);
  const band = `M ${xT.toFixed(1)} ${yT.toFixed(1)} L ${xH.toFixed(1)} ${yOf(horizon.high).toFixed(1)} L ${xH.toFixed(1)} ${yOf(horizon.low).toFixed(1)} Z`;
  const midPath = `M ${xT.toFixed(1)} ${yT.toFixed(1)} L ${xH.toFixed(1)} ${yOf(horizon.mid).toFixed(1)}`;

  const yLabels = [0, yMax / 2, yMax];

  return (
    <div style={{ display: "flex", alignItems: "stretch", height: H }}>
      <div ref={ref} style={{ flex: 1, position: "relative" }}>
        <svg viewBox={`0 0 ${w} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: "block" }}>
          {/* forward band (low–high) */}
          <path d={band} fill="var(--accent)" fillOpacity={0.12} />
          {/* today divider */}
          <line x1={xT} y1={PAD_TOP} x2={xT} y2={PAD_TOP + drawH} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
          {/* history (solid) */}
          {histPath && <path d={histPath} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />}
          {/* mid projection (dashed) */}
          <path d={midPath} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 4" strokeLinecap="round" />
          {/* endpoint dot */}
          <circle cx={xH} cy={yOf(horizon.mid)} r={3} fill="var(--accent)" />
        </svg>

        {/* x labels (HTML overlay so fonts aren't stretched by preserveAspectRatio) */}
        <span style={{ position: "absolute", bottom: 0, left: `${(xT / Math.max(w, 1)) * 100}%`, transform: "translateX(-50%)", fontSize: 10, color: "var(--text-faint)" }}>today</span>
        <span style={{ position: "absolute", bottom: 0, right: 0, fontSize: 10, color: "var(--text-faint)" }}>{horizonYear}</span>
      </div>

      {/* Y-axis labels */}
      <div style={{ width: 44, position: "relative" }}>
        {yLabels.map((v) => (
          <div
            key={v}
            style={{
              position: "absolute",
              top: `${(1 - v / yMax) * 100}%`,
              right: 0,
              transform: "translateY(-50%)",
              fontSize: 11,
              color: "var(--text-faint)",
              lineHeight: 1,
              pointerEvents: "none",
            }}
          >
            {compactMoney(v, symbol)}
          </div>
        ))}
      </div>
    </div>
  );
}

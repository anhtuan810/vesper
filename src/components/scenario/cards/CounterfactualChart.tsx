"use client";

import { useState, useEffect, useRef } from "react";
import { niceCeil, compactMoney } from "@/components/scenario/cards/chart-utils";

// Actual vs counterfactual curves, in ProjectionChart's visual language. Pure
// presentational: both series arrive via props already in display-currency
// numbers — nothing is recomputed here.

export function CounterfactualChart({
  actual,
  counterfactual,
  symbol,
}: {
  actual: Array<{ t: number; v: number }>;
  counterfactual: Array<{ t: number; v: number }>;
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

  if (actual.length < 2) return <div style={{ height: H }} />;

  const allT = [...actual, ...counterfactual].map((p) => p.t);
  const minT = Math.min(...allT);
  const maxT = Math.max(...allT);
  const xOf = (t: number) => (maxT === minT ? 0 : ((t - minT) / (maxT - minT)) * drawW);
  const yMax = niceCeil(Math.max(...actual.map((p) => p.v), ...counterfactual.map((p) => p.v), 1) * 1.08) || 1;
  const yOf = (v: number) => PAD_TOP + drawH - (v / yMax) * drawH;

  const pathOf = (pts: Array<{ t: number; v: number }>) =>
    pts.length >= 2 ? "M " + pts.map((p) => `${xOf(p.t).toFixed(1)} ${yOf(p.v).toFixed(1)}`).join(" L ") : "";
  const actualPath = pathOf(actual);
  const cfPath = pathOf(counterfactual);
  // Contribution band: between the two curves (actual − counterfactual = position value).
  const band =
    "M " + actual.map((p) => `${xOf(p.t).toFixed(1)} ${yOf(p.v).toFixed(1)}`).join(" L ") +
    " L " + [...counterfactual].reverse().map((p) => `${xOf(p.t).toFixed(1)} ${yOf(p.v).toFixed(1)}`).join(" L ") + " Z";

  const yLabels = [0, yMax / 2, yMax];
  const lastA = actual[actual.length - 1];
  const lastC = counterfactual[counterfactual.length - 1];

  return (
    <div style={{ display: "flex", alignItems: "stretch", height: H }}>
      <div ref={ref} style={{ flex: 1, position: "relative" }}>
        <svg viewBox={`0 0 ${w} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: "block" }}>
          {/* contribution band */}
          <path d={band} fill="var(--accent)" fillOpacity={0.1} />
          {/* counterfactual (without the position) — muted dashed */}
          {cfPath && <path d={cfPath} fill="none" stroke="var(--text-faint)" strokeWidth={1.5} strokeDasharray="4 4" strokeLinecap="round" strokeLinejoin="round" />}
          {/* actual — solid accent */}
          {actualPath && <path d={actualPath} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />}
          {/* endpoint dots */}
          {lastC && <circle cx={xOf(lastC.t)} cy={yOf(lastC.v)} r={3} fill="var(--text-faint)" />}
          {lastA && <circle cx={xOf(lastA.t)} cy={yOf(lastA.v)} r={3} fill="var(--accent)" />}
        </svg>
        <span style={{ position: "absolute", bottom: 0, left: 0, fontSize: "var(--fs-micro)", color: "var(--text-faint)", fontFamily: "var(--font-numeric)" }}>
          {new Date(minT).getFullYear()}
        </span>
        <span style={{ position: "absolute", bottom: 0, right: 0, fontSize: "var(--fs-micro)", color: "var(--text-faint)" }}>today</span>
      </div>

      {/* Y-axis labels */}
      <div style={{ width: 44, position: "relative" }}>
        {yLabels.map((v) => (
          <div
            key={v}
            style={{ position: "absolute", top: `${(1 - v / yMax) * 100}%`, right: 0, transform: "translateY(-50%)", fontSize: "var(--fs-micro)", color: "var(--text-faint)", lineHeight: 1, pointerEvents: "none", fontFamily: "var(--font-numeric)" }}
          >
            {compactMoney(v, symbol)}
          </div>
        ))}
      </div>
    </div>
  );
}

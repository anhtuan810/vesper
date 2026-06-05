"use client";

import { computeCurrentBalance } from "@/lib/mortgage";
import { toUsdClient, formatMoney } from "@/lib/money";
import { useDisplayCurrency } from "@/lib/hooks";
import type { LiveAsset } from "@/lib/supabase";

// These mirror the Portfolio holdings grouping EXACTLY (same category map, same
// per-class colors). No shared helper exists, so the slice values are computed
// from the SAME asset set with the SAME equity basis the holdings class totals
// use (value − computeCurrentBalance for real estate) — so the two agree exactly.
const CATEGORY_MAP: Record<string, string> = {
  real_estate: "property",
  stocks: "markets",
  etf: "markets",
  crypto: "crypto",
  cash: "reserves",
  pension: "reserves",
  bonds: "reserves",
  gold: "reserves",
  other: "reserves",
};
const CATEGORY_LABEL: Record<string, string> = {
  property: "Property",
  markets: "Public markets",
  reserves: "Reserves",
  crypto: "Crypto",
};
const CATEGORY_COLOR: Record<string, string> = {
  property: "var(--category-property)",
  markets: "var(--category-public-markets)",
  reserves: "var(--category-reserves)",
  crypto: "var(--category-crypto)",
};
const CATEGORY_ORDER = ["property", "markets", "reserves", "crypto"] as const;

// Asset-class allocation donut: one slice per present class, sized by its
// net-worth contribution (real estate at equity), so the slices sum to net worth.
// Inline SVG (stroke-dasharray arcs) consistent with the app's other charts.
export function AllocationDonut({ assets }: { assets: LiveAsset[] }) {
  const displayCurrency = useDisplayCurrency();

  // Per-class equity contribution to net worth, in USD — identical to the holdings
  // class totals (PortfolioTab): real estate at equity, everything else at value.
  const byCat: Record<string, number> = {};
  for (const a of assets) {
    const cat = CATEGORY_MAP[a.type] ?? "reserves";
    const equity = a.type === "real_estate" ? a.value - computeCurrentBalance(a) : a.value;
    byCat[cat] = (byCat[cat] ?? 0) + toUsdClient(equity, a.currency || "USD");
  }

  const slices = CATEGORY_ORDER
    .filter((c) => (byCat[c] ?? 0) > 0)
    .map((c) => ({ category: c, label: CATEGORY_LABEL[c], color: CATEGORY_COLOR[c], value: byCat[c] }))
    .sort((a, b) => b.value - a.value);

  const total = slices.reduce((s, x) => s + x.value, 0);

  // Omit empty/zero classes; render nothing until there's a positive net worth.
  if (slices.length === 0 || total <= 0) return null;

  // ── Geometry (viewBox units; the SVG scales to its container width) ──────────
  const VB_W = 440;
  const VB_H = 220;
  const cx = 220;
  const cy = 110;
  const R = 54;
  const stroke = 16;
  const C = 2 * Math.PI * R;
  const rEdge = R + stroke / 2; // outer edge of the ring — leader start
  const rElbow = R + 16; // short radial kick before the label
  const rightX = cx + 90; // leader endpoint column, right side
  const leftX = cx - 90; // leader endpoint column, left side
  const MIN_GAP = 26; // minimum vertical spacing between callouts (viewBox units)
  const yTop = 16;
  const yBottom = VB_H - 16;

  // One callout per slice, anchored at the slice mid-angle. Arcs start at 12
  // o'clock and run clockwise (rotate(-90)), so for fraction f along the ring:
  //   x = cx + r·sin(2πf), y = cy − r·cos(2πf).
  type Callout = {
    category: string; label: string; color: string; value: number;
    pct: number; side: "left" | "right";
    p0: { x: number; y: number }; elbow: { x: number; y: number };
    labelY: number;
  };

  const callouts: Callout[] = slices.map((s, i) => {
    const frac = s.value / total;
    // Cumulative fraction before this slice (pure — mirrors the arc offset).
    const before = slices.slice(0, i).reduce((sum, x) => sum + x.value / total, 0);
    const mid = before + frac / 2;
    const a = 2 * Math.PI * mid;
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    const side: "left" | "right" = sin >= 0 ? "right" : "left";
    return {
      category: s.category, label: s.label, color: s.color, value: s.value,
      pct: Math.round(frac * 100),
      side,
      p0: { x: cx + rEdge * sin, y: cy - rEdge * cos },
      elbow: { x: cx + rElbow * sin, y: cy - rElbow * cos },
      labelY: cy - rElbow * cos, // seed; resolved below
    };
  });

  // Collision avoidance: per side, sort by anchor y and enforce MIN_GAP. A forward
  // pass nudges labels down; if the group overflows the bottom, shift it up and
  // re-clamp. Holds for up to 4 slices on a side.
  for (const side of ["left", "right"] as const) {
    const group = callouts.filter((c) => c.side === side).sort((a, b) => a.labelY - b.labelY);
    if (group.length === 0) continue;
    let prev = -Infinity;
    for (const c of group) { c.labelY = Math.max(c.labelY, prev + MIN_GAP); prev = c.labelY; }
    const overflow = group[group.length - 1].labelY - yBottom;
    if (overflow > 0) for (const c of group) c.labelY -= overflow;
    prev = -Infinity;
    for (const c of group) { c.labelY = Math.max(c.labelY, Math.max(prev + MIN_GAP, yTop)); prev = c.labelY; }
  }

  return (
    <div style={{
      background: "var(--surface)",
      border: "0.5px solid var(--border)",
      borderRadius: 14,
      padding: 16,
      marginBottom: 11,
    }}>
      <div style={{
        fontSize: "9.5px",
        fontWeight: 500,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--text-faint)",
        marginBottom: 14,
      }}>
        Allocation
      </div>

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        style={{ width: "100%", maxWidth: 420, margin: "0 auto", display: "block" }}
      >
        {/* Donut — one arc per class */}
        {slices.map((s, i) => {
          const len = (s.value / total) * C;
          const offset = slices.slice(0, i).reduce((sum, x) => sum + (x.value / total) * C, 0);
          return (
            <circle
              key={s.category}
              cx={cx}
              cy={cy}
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`}
              strokeDashoffset={(-offset).toFixed(2)}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
        })}

        {/* Centre net-worth label */}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          style={{ fontSize: 8, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", fill: "var(--text-faint)" }}
        >
          Net worth
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 18,
            fontWeight: 500,
            fill: "var(--hero)",
            letterSpacing: "-0.01em",
            fontFeatureSettings: '"tnum" 1',
            fontVariationSettings: "'opsz' 18",
          }}
        >
          {formatMoney(total, "USD", displayCurrency)}
        </text>

        {/* Floating callouts: leader line + full name + value · share */}
        {callouts.map((c) => {
          const labelX = c.side === "right" ? rightX : leftX;
          const textX = c.side === "right" ? labelX + 12 : labelX - 12;
          const dotX = c.side === "right" ? labelX + 4 : labelX - 4;
          const anchor = c.side === "right" ? "start" : "end";
          return (
            <g key={c.category}>
              <polyline
                points={`${c.p0.x.toFixed(1)},${c.p0.y.toFixed(1)} ${c.elbow.x.toFixed(1)},${c.elbow.y.toFixed(1)} ${labelX},${c.labelY.toFixed(1)}`}
                fill="none"
                stroke={c.color}
                strokeWidth={1}
              />
              <circle cx={dotX} cy={c.labelY - 4} r={3} fill={c.color} />
              <text
                x={textX}
                y={c.labelY - 1}
                textAnchor={anchor}
                style={{ fontSize: 11, fontWeight: 500, fill: "var(--text)" }}
              >
                {c.label}
              </text>
              <text
                x={textX}
                y={c.labelY + 11}
                textAnchor={anchor}
                style={{ fontSize: 10, fill: "var(--text-dim)", fontFeatureSettings: '"tnum" 1' }}
              >
                {formatMoney(c.value, "USD", displayCurrency)}
                <tspan style={{ fill: "var(--text-faint)" }}>{" · "}{c.pct}%</tspan>
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

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

  const size = 132;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;

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

      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        {/* Donut — one arc per class, with net worth in the centre */}
        <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
            {slices.map((s, i) => {
              const len = (s.value / total) * C;
              // Cumulative arc length before this slice (pure — no render mutation).
              const offset = slices.slice(0, i).reduce((sum, x) => sum + (x.value / total) * C, 0);
              return (
                <circle
                  key={s.category}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`}
                  strokeDashoffset={(-offset).toFixed(2)}
                  transform={`rotate(-90 ${cx} ${cy})`}
                />
              );
            })}
          </svg>
          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}>
            <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-faint)" }}>
              Net worth
            </div>
            <div style={{
              fontFamily: "var(--font-serif)",
              fontSize: 17,
              fontWeight: 500,
              color: "var(--hero)",
              letterSpacing: "-0.01em",
              fontFeatureSettings: '"tnum" 1',
              fontVariationSettings: "'opsz' 18",
              lineHeight: 1.1,
              marginTop: 2,
            }}>
              {formatMoney(total, "USD", displayCurrency)}
            </div>
          </div>
        </div>

        {/* Legend — class · value · % share */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 9 }}>
          {slices.map((s) => (
            <div key={s.category} style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 500, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {s.label}
              </span>
              <span style={{ fontSize: 13, color: "var(--text-dim)", fontFeatureSettings: '"tnum" 1', flexShrink: 0 }}>
                {formatMoney(s.value, "USD", displayCurrency)}
              </span>
              <span style={{ fontSize: 11.5, color: "var(--text-faint)", fontFeatureSettings: '"tnum" 1', width: 38, textAlign: "right", flexShrink: 0 }}>
                {((s.value / total) * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

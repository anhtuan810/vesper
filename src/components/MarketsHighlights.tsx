"use client";

import { useState, useEffect } from "react";
import type { MarketHighlight } from "@/lib/market-highlights";

// Collapsed "Markets" slot for the portfolio summary card — revives the
// type='market' highlights the cron writes (deserialized server-side via
// parseMarketDetail and delivered through dashboard-init's `marketHighlights`).
// Read-only: collapsed by default, taps only toggle the list open. When there
// are no current market highlights it renders nothing, so the card shows no
// empty Markets slot.

// Vitals' uppercase tracked section-label style (VitalCard eyebrow).
const SECTION_LABEL: React.CSSProperties = {
  fontSize: "9.5px", fontWeight: 500, letterSpacing: "0.18em",
  textTransform: "uppercase", color: "var(--text-faint)",
};

const CHEVRON_SVG = {
  viewBox: "0 0 256 256", fill: "none", stroke: "currentColor",
  strokeWidth: 20, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

function formatImpact(value: number): string {
  const abs = Math.abs(Math.round(value));
  return (value >= 0 ? "+" : "−") + "€" + abs.toLocaleString();
}

interface MarketsHighlightsProps {
  marketHighlights: MarketHighlight[];
  /** Reports whether the slot rendered anything, so the card can sync the
   *  hairline divider above it to the same "only between visible slots" rule. */
  onVisibleChange?: (visible: boolean) => void;
}

export function MarketsHighlights({ marketHighlights, onVisibleChange }: MarketsHighlightsProps) {
  const [open, setOpen] = useState(false);

  const hasMarket = marketHighlights.length > 0;

  useEffect(() => {
    onVisibleChange?.(hasMarket);
  }, [hasMarket, onVisibleChange]);

  if (!hasMarket) return null;

  const top = marketHighlights[0];
  const restCount = marketHighlights.length - 1;
  const topImpact = top.impact_eur != null ? ` ${formatImpact(top.impact_eur)}` : "";
  const summary = restCount > 0
    ? `${top.title}${topImpact} · ${restCount} more ${restCount === 1 ? "move" : "moves"}`
    : `${top.title}${topImpact}`;

  return (
    <div style={{ padding: "14px 18px 12px" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          width: "100%", textAlign: "left",
          background: "none", border: "none", cursor: "pointer", padding: 0,
        }}
      >
        <span style={{ ...SECTION_LABEL, flexShrink: 0 }}>Markets</span>
        {!open && (
          <span
            className="font-serif"
            style={{
              flex: 1, minWidth: 0, fontSize: 13, fontStyle: "italic",
              lineHeight: 1.35, color: "var(--text)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {summary}
          </span>
        )}
        <svg
          {...CHEVRON_SVG}
          style={{
            width: 11, height: 11, marginLeft: open ? "auto" : 0,
            color: "var(--accent-text)", opacity: 0.45, flexShrink: 0,
            transition: "transform 0.15s", transform: open ? "rotate(90deg)" : undefined,
          }}
        >
          <polyline points="96 48 176 128 96 208" />
        </svg>
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          {marketHighlights.map((m, i) => (
            <div key={m.id ?? m.title} style={{ marginTop: i > 0 ? 12 : 0 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <span
                  className="font-serif"
                  style={{ flex: 1, minWidth: 0, fontSize: 13, fontStyle: "italic", lineHeight: 1.35, color: "var(--text)" }}
                >
                  {m.title}
                </span>
                {m.impact_eur != null && (
                  <span
                    style={{
                      flexShrink: 0, fontSize: 11, fontWeight: 500, letterSpacing: "-0.01em",
                      color: m.impact_eur >= 0 ? "var(--accent-text)" : "var(--negative-text)",
                    }}
                  >
                    {formatImpact(m.impact_eur)}
                  </span>
                )}
              </div>
              {m.detail && (
                <div style={{ marginTop: 3, fontSize: 12, lineHeight: 1.45, color: "var(--text)", opacity: 0.6 }}>
                  {m.detail}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

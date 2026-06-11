"use client";

import { useState, useEffect } from "react";
import type { MarketHighlight } from "@/lib/market-highlights";

// Flat "Markets" section for the portfolio summary — revives the type='market'
// highlights the cron writes (deserialized server-side via parseMarketDetail
// and delivered through dashboard-init's `marketHighlights`). Read-only: a
// borderless list of headline rows, each independently collapsed by default
// and expandable on tap to reveal its detail. When there are no current
// market highlights it renders nothing, so the section (and its divider)
// doesn't show.

const SVG_PROPS = {
  viewBox: "0 0 256 256", fill: "none", stroke: "currentColor",
  strokeWidth: 20, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

function ActivityIcon({ size = 12, color }: { size?: number; color: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: size, height: size, flexShrink: 0 }}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const hasMarket = marketHighlights.length > 0;

  useEffect(() => {
    onVisibleChange?.(hasMarket);
  }, [hasMarket, onVisibleChange]);

  if (!hasMarket) return null;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div style={{ padding: "7px 0" }}>
      {marketHighlights.map((m, i) => {
        const id = m.id ?? `${m.title}-${i}`;
        const isOpen = expanded.has(id);
        return (
          <button
            key={id}
            type="button"
            aria-expanded={isOpen}
            onClick={() => toggle(id)}
            style={{
              display: "block", width: "100%", textAlign: "left",
              background: "none", border: "none", cursor: "pointer", padding: "4px 0",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              {i === 0
                ? <ActivityIcon size={13} color="var(--text-faint)" />
                : <span style={{ width: 13, flexShrink: 0 }} />}
              <span
                className="font-serif"
                style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 500, fontStyle: "italic", lineHeight: 1.35, color: "var(--text)" }}
              >
                {m.title}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0, marginTop: 2 }}>
                {m.impact_eur != null && (
                  <span
                    style={{
                      fontSize: 12, fontWeight: 500, letterSpacing: "-0.01em",
                      color: m.impact_eur >= 0 ? "var(--accent-text)" : "var(--negative-text)",
                    }}
                  >
                    {formatImpact(m.impact_eur)}
                  </span>
                )}
                <svg {...SVG_PROPS} style={{
                  width: 11, height: 11, color: "var(--accent-text)", opacity: 0.45,
                  flexShrink: 0, transition: "transform 0.15s",
                  transform: isOpen ? "rotate(90deg)" : undefined,
                }}>
                  <polyline points="96 48 176 128 96 208" />
                </svg>
              </div>
            </div>
            {isOpen && m.detail && (
              <div style={{ marginTop: 3, marginLeft: 21, fontSize: 11.5, lineHeight: 1.4, color: "var(--text)", opacity: 0.6 }}>
                {m.detail}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

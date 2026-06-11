"use client";

import { useState, useEffect } from "react";
import { SwipeCarousel, CarouselDots } from "@/components/SwipeCarousel";
import type { MarketHighlight } from "@/lib/market-highlights";

// Flat "Markets" section for the portfolio summary — revives the type='market'
// highlights the cron writes (deserialized server-side via parseMarketDetail
// and delivered through dashboard-init's `marketHighlights`). Read-only: a
// SwipeCarousel of up to a few moves, one per slide, with tappable dot
// indicators. When there are no current market highlights it renders nothing,
// so the section (and its divider) doesn't show.

// Vitals' uppercase tracked section-label style (VitalCard eyebrow).
const SECTION_LABEL: React.CSSProperties = {
  fontSize: "10.5px", fontWeight: 500, letterSpacing: "0.18em",
  textTransform: "uppercase", color: "var(--text-faint)",
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
  const [activeIndex, setActiveIndex] = useState(0);

  const hasMarket = marketHighlights.length > 0;

  useEffect(() => {
    onVisibleChange?.(hasMarket);
  }, [hasMarket, onVisibleChange]);

  if (!hasMarket) return null;

  // Derived, not stored, so a shrinking list never leaves a stale
  // out-of-range index.
  const safeActiveIndex = Math.min(activeIndex, marketHighlights.length - 1);

  return (
    <div style={{ padding: "9px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ActivityIcon color="var(--text-faint)" />
          <span style={SECTION_LABEL}>Markets</span>
        </div>
        <CarouselDots count={marketHighlights.length} activeIndex={safeActiveIndex} onSelect={setActiveIndex} />
      </div>
      <div style={{ marginTop: 6 }}>
        <SwipeCarousel
          items={marketHighlights}
          activeIndex={safeActiveIndex}
          onActiveIndexChange={setActiveIndex}
          getKey={(m, i) => m.id ?? `${m.title}-${i}`}
          renderItem={(m) => (
            <div>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <span
                  className="font-serif"
                  style={{ flex: 1, minWidth: 0, fontSize: 13, fontStyle: "italic", lineHeight: 1.35, color: "var(--text)" }}
                >
                  {m.title}
                </span>
                {m.impact_eur != null && (
                  <span
                    style={{
                      flexShrink: 0, fontSize: 12, fontWeight: 500, letterSpacing: "-0.01em",
                      color: m.impact_eur >= 0 ? "var(--accent-text)" : "var(--negative-text)",
                    }}
                  >
                    {formatImpact(m.impact_eur)}
                  </span>
                )}
              </div>
              {m.detail && (
                <div style={{ marginTop: 3, fontSize: 11.5, lineHeight: 1.4, color: "var(--text)", opacity: 0.6 }}>
                  {m.detail}
                </div>
              )}
            </div>
          )}
        />
      </div>
    </div>
  );
}

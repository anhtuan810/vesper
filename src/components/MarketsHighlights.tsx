"use client";

import { useEffect } from "react";
import type { MarketHighlight } from "@/lib/market-highlights";
import { SwipeExpandCarousel } from "@/components/SwipeExpandCarousel";

// "Markets" — PortfolioSummaryCard's carousel of up to 3 daily market-news
// items (cron-generated `type='market'` highlights, deserialized via
// parseMarketDetail and delivered through dashboard-init's
// `marketHighlights`). Shares its presentation — collapsible slides, inline
// dots, leading icon, borderless — with Worth knowing via
// SwipeExpandCarousel. Read-only: no chat hand-off. When there are no
// current market highlights it renders nothing, so the section (and its
// divider) doesn't show.

function ActivityIcon({ size = 14, color }: { size?: number; color: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: size, height: size, flexShrink: 0, marginTop: 2 }}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

interface MarketsHighlightsProps {
  marketHighlights: MarketHighlight[];
  /** Reports whether the slot rendered anything, so the card can sync the
   *  hairline divider above it to the same "only between visible slots" rule. */
  onVisibleChange?: (visible: boolean) => void;
}

export function MarketsHighlights({ marketHighlights, onVisibleChange }: MarketsHighlightsProps) {
  const hasMarket = marketHighlights.length > 0;

  useEffect(() => {
    onVisibleChange?.(hasMarket);
  }, [hasMarket, onVisibleChange]);

  if (!hasMarket) return null;

  const items = marketHighlights.map((m) => ({ title: m.title, detail: m.detail }));

  return (
    <div style={{ padding: "var(--space-1) 0" }}>
      <SwipeExpandCarousel
        icon={<ActivityIcon color="var(--text-faint)" />}
        items={items}
        getKey={(_item, i) => marketHighlights[i].id ?? `${marketHighlights[i].title}-${i}`}
      />
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { MarketHighlight } from "@/lib/market-highlights";
import { SwipeExpandCarousel, SignalIconChip } from "@/components/SwipeExpandCarousel";
import { useDisplayCurrency } from "@/lib/hooks";
import { formatMoneyCompact, isSupportedCurrency } from "@/lib/money";

// "Markets" — the pulse row for the daily market-news items (cron-generated
// `type='market'` highlights). One line per story with the estimated EUR
// portfolio impact as a quiet aside; expanding opens the drop-down box with
// the detail, the impact meta line, and the row's trigger sentence, which
// seeds chat with a question about what the story means for THIS portfolio.
// When there are no current market highlights it renders nothing, so the
// section (and its divider) doesn't show.

function BarsIcon({ size = 13 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: size, height: size, flexShrink: 0 }}>
      <line x1="5" y1="20" x2="5" y2="12" />
      <line x1="12" y1="20" x2="12" y2="5" />
      <line x1="19" y1="20" x2="19" y2="9" />
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
  const displayCurrency = useDisplayCurrency();
  const router = useRouter();

  useEffect(() => {
    onVisibleChange?.(hasMarket);
  }, [hasMarket, onVisibleChange]);

  if (!hasMarket) return null;

  // "≈ +€85" — the cron's estimated impact, converted like every other
  // EUR-normalized figure. Sub-euro estimates are noise, not signal.
  const dc = isSupportedCurrency(displayCurrency) ? displayCurrency : "EUR";
  const fmtImpact = (eur: number | null): string | null => {
    if (eur == null || !isFinite(eur) || Math.abs(eur) < 1) return null;
    return `≈ ${eur < 0 ? "−" : "+"}${formatMoneyCompact(Math.abs(eur), "EUR", dc)}`;
  };

  const askQuestion = (question: string) => {
    try { sessionStorage.setItem("volnar.insight.seed", question); } catch {}
    router.push("/chat?seed=insight&key=current");
  };

  const items = marketHighlights.map((m) => {
    const impact = fmtImpact(m.impact_eur);
    const question = m.symbol
      ? `${m.title} — what does this mean for my ${m.symbol} position?`
      : `${m.title} — what does this news mean for my portfolio?`;
    const label = m.symbol
      ? `What does this mean for my ${m.symbol}?`
      : "What does this mean for me?";
    return {
      title: m.title,
      detail: m.detail,
      aside: impact,
      meta: impact ? `${impact} on your sheet${m.symbol ? ` · ${m.symbol}` : ""}` : null,
      trigger: { label, onActivate: () => askQuestion(question) },
    };
  });

  return (
    <div style={{ padding: "var(--space-1) 0" }}>
      <SwipeExpandCarousel
        icon={
          <SignalIconChip>
            <BarsIcon />
          </SignalIconChip>
        }
        items={items}
        getKey={(_item, i) => marketHighlights[i].id ?? `${marketHighlights[i].title}-${i}`}
      />
    </div>
  );
}

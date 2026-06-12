"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useInsight } from "@/lib/hooks";
import { BulbIcon } from "@/components/vitals/SuggestionStrip";
import { SwipeExpandCarousel, type SwipeExpandItem } from "@/components/SwipeExpandCarousel";

// "Worth knowing" — PortfolioSummaryCard's carousel of up to 3 ordered
// {title, detail} cards from /api/insight (deterministic portfolio
// detectors, phrased by Haiku; or a single legacy free-form insight as
// fallback). Shares its presentation — collapsible slides, inline dots,
// leading icon, borderless — with Markets via SwipeExpandCarousel. Tapping
// an expanded detail seeds a chat prompt with that observation.
export function InsightBand({ onVisibleChange }: { onVisibleChange?: (visible: boolean) => void } = {}) {
  const { insights, loading } = useInsight();
  const router = useRouter();

  useEffect(() => {
    onVisibleChange?.(!loading && insights.length > 0);
  }, [loading, insights.length, onVisibleChange]);

  if (loading) {
    return (
      <div style={{ padding: "5px 0" }}>
        <div style={{ height: 9, width: 90, borderRadius: 3, background: "var(--text-faint)", opacity: 0.15, marginBottom: 8 }} />
        <div style={{ height: 13, width: "75%", borderRadius: 3, background: "var(--text-faint)", opacity: 0.15 }} />
      </div>
    );
  }

  if (insights.length === 0) return null;

  const handleDetailClick = (item: SwipeExpandItem) => {
    sessionStorage.setItem("volnar.insight.seed", `Tell me more about: ${item.detail}`);
    router.push("/chat?seed=insight&key=current");
  };

  return (
    <div style={{ padding: "5px 0" }}>
      <SwipeExpandCarousel
        icon={<BulbIcon color="var(--text-faint)" />}
        items={insights}
        onDetailClick={handleDetailClick}
      />
    </div>
  );
}

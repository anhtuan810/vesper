"use client";

import { useState } from "react";
import { ProjectionTeaser } from "@/components/scenario/ProjectionTeaser";
import { InsightBand } from "@/components/InsightBand";
import { MarketsHighlights } from "@/components/MarketsHighlights";
import type { SnapshotPoint } from "@/components/NetWorthChart";
import type { MarketHighlight } from "@/lib/market-highlights";

interface PortfolioSummaryCardProps {
  netTotal: number;
  snapshots: SnapshotPoint[];
  marketHighlights: MarketHighlight[];
  onExplore: () => void;
}

const DIVIDER = <div style={{ borderTop: "0.5px solid var(--border)" }} />;

// "Portfolio summary" — three flat, hairline-separated sections (Projection,
// Worth knowing, Markets) sitting directly on the page, no card container. Each
// slot self-reports whether it rendered anything; a divider is drawn only
// between two visible sections, so a hidden projection, an absent insight, or
// empty markets never leaves a stray hairline.
export function PortfolioSummaryCard({ netTotal, snapshots, marketHighlights, onExplore }: PortfolioSummaryCardProps) {
  const [showProjection, setShowProjection] = useState(false);
  const [showInsight, setShowInsight] = useState(false);
  const [showMarket, setShowMarket] = useState(false);

  return (
    <div>
      <ProjectionTeaser
        variant="card"
        onExplore={onExplore}
        snapshots={snapshots}
        netTotal={netTotal}
        onVisibleChange={setShowProjection}
      />
      {showProjection && showInsight && DIVIDER}
      <InsightBand variant="card" onVisibleChange={setShowInsight} />
      {(showProjection || showInsight) && showMarket && DIVIDER}
      <MarketsHighlights marketHighlights={marketHighlights} onVisibleChange={setShowMarket} />
    </div>
  );
}

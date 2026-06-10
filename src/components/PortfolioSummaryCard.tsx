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

// "Portfolio summary" card on the Portfolio tab, restyled to the Vitals theme —
// one white surface holding the projection teaser, the "worth knowing" sage
// callout, and the collapsed Markets section. Each slot self-reports whether it
// rendered anything; a hairline divider is drawn only between the callout and
// Markets, so a hidden projection, an absent insight, or empty markets never
// leaves a stray line.
export function PortfolioSummaryCard({ netTotal, snapshots, marketHighlights, onExplore }: PortfolioSummaryCardProps) {
  const [showProjection, setShowProjection] = useState(false);
  const [showInsight, setShowInsight] = useState(false);
  const [showMarket, setShowMarket] = useState(false);

  const aboveMarket = showProjection || showInsight;

  return (
    <div
      style={{
        border: "0.5px solid var(--border)",
        borderRadius: 14,
        overflow: "hidden",
        background: "var(--surface)",
      }}
    >
      <ProjectionTeaser
        variant="card"
        onExplore={onExplore}
        snapshots={snapshots}
        netTotal={netTotal}
        onVisibleChange={setShowProjection}
      />
      <InsightBand variant="card" onVisibleChange={setShowInsight} />
      {aboveMarket && showMarket && DIVIDER}
      <MarketsHighlights marketHighlights={marketHighlights} onVisibleChange={setShowMarket} />
    </div>
  );
}

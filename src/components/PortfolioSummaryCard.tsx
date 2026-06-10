"use client";

import { useState } from "react";
import { ProjectionTeaser } from "@/components/scenario/ProjectionTeaser";
import { InsightBand } from "@/components/InsightBand";
import { MarketsHighlights } from "@/components/MarketsHighlights";
import type { SnapshotPoint } from "@/components/NetWorthChart";

interface PortfolioSummaryCardProps {
  netTotal: number;
  snapshots: SnapshotPoint[];
  onExplore: () => void;
}

const DIVIDER = <div style={{ borderTop: "0.5px solid var(--border)" }} />;

// Bordered "portfolio summary" card on the Portfolio tab — one surface holding
// the projection teaser (hero band), the insight observation (unboxed comment
// row), and the collapsed Markets highlights. Each slot self-reports whether it
// rendered anything; a hairline divider is drawn only BETWEEN two visible slots,
// so a hidden projection, an absent insight, or empty markets never leaves a
// stray line.
export function PortfolioSummaryCard({ netTotal, snapshots, onExplore }: PortfolioSummaryCardProps) {
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
        background: "var(--surface-center)",
      }}
    >
      <ProjectionTeaser
        variant="card"
        onExplore={onExplore}
        snapshots={snapshots}
        netTotal={netTotal}
        onVisibleChange={setShowProjection}
      />
      {showProjection && showInsight && DIVIDER}
      <InsightBand variant="card" onVisibleChange={setShowInsight} />
      {aboveMarket && showMarket && DIVIDER}
      <MarketsHighlights onVisibleChange={setShowMarket} />
    </div>
  );
}

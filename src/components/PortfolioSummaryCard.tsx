"use client";

import { useState } from "react";
import { ProjectionTeaser } from "@/components/scenario/ProjectionTeaser";
import { InsightBand } from "@/components/InsightBand";
import type { SnapshotPoint } from "@/components/NetWorthChart";

interface PortfolioSummaryCardProps {
  netTotal: number;
  snapshots: SnapshotPoint[];
  onExplore: () => void;
}

// Bordered "portfolio summary" card on the Portfolio tab — consolidates the
// projection teaser (tinted hero band) and the insight observation (unboxed
// italic-serif comment row) under one shell. A third slot for a Markets
// section is left for a later prompt: when added, it should follow the same
// "divider only if the slot above rendered something" pattern as the hero
// band's divider below.
export function PortfolioSummaryCard({ netTotal, snapshots, onExplore }: PortfolioSummaryCardProps) {
  const [showProjection, setShowProjection] = useState(false);

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
      {showProjection && <div style={{ borderTop: "0.5px solid var(--border)" }} />}
      <InsightBand variant="card" />
    </div>
  );
}

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

const DIVIDER = <div style={{ borderTop: "0.5px solid var(--border)" }} />;

// "Portfolio summary" — two compact, hairline-separated rows (Projection and
// Worth knowing) held in ONE contained card (surface + hairline border + radius)
// so the block reads as a single designed object lifted off the page instead of
// loose floating text. Each slot self-reports whether it rendered anything; the
// divider is drawn only when BOTH rows are visible, so a hidden projection or an
// absent insight never leaves a stray hairline. When nothing renders, the card
// collapses to nothing (no empty box). The Markets row now lives at the top of
// the Vitals page instead.
export function PortfolioSummaryCard({ netTotal, snapshots, onExplore }: PortfolioSummaryCardProps) {
  const [showProjection, setShowProjection] = useState(false);
  const [showInsight, setShowInsight] = useState(false);

  const anyVisible = showProjection || showInsight;

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: anyVisible ? "5px 16px" : 0,
        transition: "padding 0.2s ease",
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
      <InsightBand onVisibleChange={setShowInsight} />
    </div>
  );
}

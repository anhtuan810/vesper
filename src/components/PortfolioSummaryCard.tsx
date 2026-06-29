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
  /** Borderless mode: drop the card's own surface/border/radius and render just
   *  the rows, so the block can sit inside another container (the combined Pulse
   *  card on the Vitals page) without nesting a card inside a card. */
  embedded?: boolean;
}

const DIVIDER = <div style={{ borderTop: "0.5px solid var(--border)" }} />;

// "Portfolio summary" — three compact, hairline-separated rows (Projection,
// Worth knowing, Markets) held in ONE contained card (surface + hairline border
// + radius) so the block reads as a single designed object lifted off the page
// instead of loose floating text. Each slot self-reports whether it rendered
// anything; a divider is drawn only between two visible rows, so a hidden
// projection, an absent insight, or empty markets never leaves a stray hairline.
// When nothing renders, the card collapses to nothing (no empty box). Now hosted
// at the top of the Vitals page (via PortfolioSummaryCardLoader).
export function PortfolioSummaryCard({ netTotal, snapshots, marketHighlights, onExplore, embedded }: PortfolioSummaryCardProps) {
  const [showProjection, setShowProjection] = useState(false);
  const [showInsight, setShowInsight] = useState(false);
  const [showMarket, setShowMarket] = useState(false);

  const anyVisible = showProjection || showInsight || showMarket;

  const rows = (
    <>
      <ProjectionTeaser
        variant="card"
        onExplore={onExplore}
        snapshots={snapshots}
        netTotal={netTotal}
        onVisibleChange={setShowProjection}
      />
      {showProjection && showInsight && DIVIDER}
      <InsightBand onVisibleChange={setShowInsight} />
      {(showProjection || showInsight) && showMarket && DIVIDER}
      <MarketsHighlights marketHighlights={marketHighlights} onVisibleChange={setShowMarket} />
    </>
  );

  // Embedded: the host container supplies the surface and horizontal padding, so
  // render just the rows (no card chrome, no double border).
  if (embedded) return rows;

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
      {rows}
    </div>
  );
}

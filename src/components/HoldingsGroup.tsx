"use client";

import { type ReactNode } from "react";
import { useDisplayCurrency } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";

interface HoldingsGroupProps {
  label: string;
  barColor: string;
  barPct: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  // The first group in the list has no preceding group to sit apart from, so it
  // drops the generous top padding — the section rule's own gap sits it close to
  // the header instead of doubling into a wide void.
  first?: boolean;
}

export function HoldingsGroup({
  label, barColor, barPct, total, expanded, onToggle, children, first = false,
}: HoldingsGroupProps) {
  const displayCurrency = useDisplayCurrency();
  return (
    <div style={{ borderBottom: "0.5px solid var(--border-strong)" }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-4)",
          // Generous top spacing sets each class apart from the previous class's
          // rows; the tighter bottom keeps the header tied to its own rows. The
          // first group needs no top gap — the section rule already provides it.
          padding: `${first ? "0" : "var(--space-4)"} 0 var(--space-row)`,
          background: "none",
          border: "none",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <span className="eyebrow" style={{
          color: "var(--text-dim)",
          flexShrink: 0,
          // Fixed width (fits the longest label — "PUBLIC MARKETS" ≈ 117px) so every
          // group's allocation bar starts at the same x: a shorter label no longer
          // lets its bar drift left, and a longer one no longer pushes it right.
          width: 120,
          textAlign: "left",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {label}
        </span>

        {/* Proportional allocation bar — class accent, thicker with rounded ends
            so it reads as a section gauge, not a row sparkline. */}
        <div style={{
          flex: 1,
          height: 6,
          background: "var(--surface-elev)",
          borderRadius: "var(--radius-pill)",
          overflow: "hidden",
          position: "relative",
        }}>
          <div style={{
            position: "absolute",
            top: 0, left: 0,
            height: "100%",
            width: `${barPct}%`,
            minWidth: 8,
            borderRadius: "var(--radius-pill)",
            background: barColor,
          }} />
        </div>

        {/* Group total */}
        <span className="tnum" style={{
          fontSize: "var(--fs-meta)",
          fontWeight: 500,
          color: "var(--text)",
          flexShrink: 0,
          // Reserve a right-aligned total column so the bars' right edges line up
          // across groups for typical values, rather than a narrower total letting
          // its bar stretch further right.
          minWidth: 68,
          textAlign: "right",
        }}>
          {formatMoney(total, displayCurrency, displayCurrency)}
        </span>
      </button>

      <div
        style={{
          display: "grid",
          gridTemplateRows: expanded ? "1fr" : "0fr",
          transition: "grid-template-rows 0.2s ease",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <div style={{ paddingBottom: "var(--space-1)" }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

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
}

export function HoldingsGroup({
  label, barColor, barPct, total, expanded, onToggle, children,
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
          gap: 14,
          // Generous top spacing sets each class apart from the previous class's
          // rows; the tighter bottom keeps the header tied to its own rows.
          padding: "24px 0 12px",
          background: "none",
          border: "none",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <span style={{
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          color: "var(--text)",
          flexShrink: 0,
          minWidth: 140,
          textAlign: "left",
        }}>
          {label}
        </span>

        {/* Proportional allocation bar — class accent, thicker with rounded ends
            so it reads as a section gauge, not a row sparkline. */}
        <div style={{
          flex: 1,
          height: 6,
          background: "var(--surface-elev)",
          borderRadius: 999,
          overflow: "hidden",
          position: "relative",
        }}>
          <div style={{
            position: "absolute",
            top: 0, left: 0,
            height: "100%",
            width: `${barPct}%`,
            minWidth: 8,
            borderRadius: 999,
            background: barColor,
          }} />
        </div>

        {/* Group total */}
        <span style={{
          fontSize: 15,
          fontWeight: 500,
          fontVariantNumeric: "tabular-nums",
          color: "var(--text)",
          flexShrink: 0,
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
          <div style={{ paddingBottom: 4 }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

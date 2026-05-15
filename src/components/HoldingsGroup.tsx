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
          padding: "14px 0 12px",
          background: "none",
          border: "none",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <span style={{
          fontSize: 18,
          fontWeight: 500,
          color: "var(--text)",
          flexShrink: 0,
          minWidth: 100,
          textAlign: "left",
        }}>
          {label}
        </span>

        {/* Proportional bar */}
        <div style={{
          flex: 1,
          height: 4,
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
          {formatMoney(total, displayCurrency)}
        </span>

        {/* Chevron */}
        <svg
          width={14}
          height={14}
          viewBox="0 0 256 256"
          fill="none"
          stroke="currentColor"
          strokeWidth={20}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            flexShrink: 0,
            color: "var(--text-faint)",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
          }}
        >
          <polyline points="96 48 176 128 96 208" />
        </svg>
      </button>

      {expanded && (
        <div style={{ paddingBottom: 4 }}>
          {children}
        </div>
      )}
    </div>
  );
}

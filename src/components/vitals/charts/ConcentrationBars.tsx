"use client";

import { useEffect, useRef, useState } from "react";
import { AssetLogo } from "@/components/AssetLogo";

// Distinct per-asset-class hues for the concentration bars. There are more
// series (9) than the app's 5 category tokens, so forcing them onto --cat-*
// causes collisions (two classes share a colour) and semantic drift; this stays
// a deliberate, distinct palette instead.
const ASSET_COLOR: Record<string, string> = {
  real_estate: '#5E6A4A',
  crypto:      '#B0552F',
  pension:     '#7A8C6A',
  cash:        '#9A8F82',
  stocks:      '#5E7488',
  etf:         '#7E92A6',
  bonds:       '#8C7B5E',
  gold:        '#97703D',
  other:       '#A89F90',
};

function colorFor(type: string): string {
  return ASSET_COLOR[type] ?? ASSET_COLOR.other;
}

function fmtPct(v: number): string {
  // nl-NL comma decimals, matching the rest of the app.
  return (v < 0 ? "−" : "") + Math.abs(v).toFixed(1).replace(".", ",") + "%";
}

interface Position {
  name: string;
  type: string;
  pct: number;
  symbol?: string;
}

interface Props {
  positions: Position[];
}

const LABEL_W = 104;
const VALUE_W = 46;
const BAR_H = 9;
const ROW_GAP = 8;
const HEADER_H = 18;

export function ConcentrationBars({ positions }: Props) {
  const sorted = [...positions].sort((a, b) => b.pct - a.pct);
  const [animated, setAnimated] = useState(false);
  // Index of the row whose full name is expanded (tap to expand, tap elsewhere
  // to collapse). Names are truncated to one line by default; tapping a row
  // reveals the full name above its bar.
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Collapse when the user taps anywhere outside the card.
  useEffect(() => {
    if (expandedIndex === null) return;
    function onDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpandedIndex(null);
      }
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [expandedIndex]);

  if (sorted.length === 0) return null;

  const top5 = sorted.slice(0, 5);
  const rest = sorted.slice(5);
  const top1Pct = sorted[0].pct;
  const axisMax = Math.max(50, Math.ceil((top1Pct + 10) / 10) * 10);
  // Threshold fraction of the track width (0–1)
  const threshFrac = 35 / axisMax;
  // CSS calc expression: left edge of threshold line from the container left.
  // The bar track excludes both the leading label column (LABEL_W) and the
  // trailing % value column (VALUE_W).
  const threshLeft = `calc(${LABEL_W}px + ${threshFrac.toFixed(6)} * (100% - ${LABEL_W}px - ${VALUE_W}px))`;

  const restCount = rest.length;
  const restSum = rest.reduce((s, p) => s + p.pct, 0);

  return (
    <div ref={containerRef} style={{ paddingTop: HEADER_H, position: "relative" }}>
      {/* Threshold label — floats above the dashed line */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: threshLeft,
          transform: "translateX(-50%)",
          fontSize: "var(--fs-caption)",
          fontWeight: 500,
          color: "var(--text-faint)",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        balanced ≤ 35%
      </div>

      {/* Rows container — threshold line is scoped to this */}
      <div style={{ position: "relative" }}>
        {/* Dashed threshold line spanning all bar rows */}
        <div
          style={{
            position: "absolute",
            left: threshLeft,
            top: 0,
            bottom: 0,
            width: 0,
            borderLeft: "1px dashed var(--border-strong)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        {top5.map((pos, i) => {
          const barWidthPct = (pos.pct / axisMax) * 100;
          const label = pos.symbol ?? pos.name;
          const isExpanded = expandedIndex === i;

          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              aria-expanded={isExpanded}
              onClick={() => setExpandedIndex((prev) => (prev === i ? null : i))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedIndex((prev) => (prev === i ? null : i)); }
              }}
              style={{
                marginBottom: i < top5.length - 1 ? ROW_GAP : 0,
                position: "relative",
                zIndex: 1,
                cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {/* Expanded: full name on its own line above the bar (wraps at word
                  boundaries, never mid-word). The bar row below keeps the same
                  LABEL_W offset so bars and the threshold line stay aligned. */}
              {isExpanded && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
                  <AssetLogo type={pos.type} symbol={pos.symbol ?? null} name={pos.name} size={18} />
                  <div style={{ flex: 1, minWidth: 0, fontSize: "var(--fs-caption)", lineHeight: "var(--lh-snug)", color: "var(--text)", overflowWrap: "break-word" }}>
                    {pos.name}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", minHeight: BAR_H + 8 }}>
                {/* Label column — icon + single-line truncated name when collapsed;
                    an empty spacer when expanded (the name moved above). */}
                <div
                  style={{
                    flexShrink: 0,
                    width: LABEL_W,
                    paddingRight: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {!isExpanded && (
                    <>
                      <AssetLogo type={pos.type} symbol={pos.symbol ?? null} name={pos.name} size={18} />
                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: "var(--fs-caption)",
                          lineHeight: "var(--lh-snug)",
                          color: "var(--text-dim)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {label}
                      </div>
                    </>
                  )}
                </div>

                {/* Bar + % label — the value column has a fixed width so the bar
                    track (flex:1, minWidth:0) never extends under it; a 100%
                    bar therefore stays inside the card. */}
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        height: BAR_H,
                        borderRadius: 2,
                        background: colorFor(pos.type),
                        width: animated ? `${barWidthPct}%` : "0%",
                        transition: animated
                          ? `width 0.45s cubic-bezier(0.25, 0.1, 0.25, 1) ${i * 65}ms`
                          : "none",
                        flexShrink: 0,
                      }}
                    />
                  </div>
                  <span
                    className="tnum"
                    style={{
                      width: VALUE_W,
                      flexShrink: 0,
                      textAlign: "left",
                      fontSize: "var(--fs-meta)",
                      color: "var(--text-dim)",
                      lineHeight: 1,
                    }}
                  >
                    {fmtPct(pos.pct)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Overflow summary — not a bar, keeps the staircase silhouette clean */}
      {restCount > 0 && (
        <div
          className="tnum"
          style={{
            marginTop: ROW_GAP,
            paddingLeft: LABEL_W,
            fontSize: "var(--fs-caption)",
            color: "var(--text-faint)",
            lineHeight: 1,
          }}
        >
          +{restCount} more · {fmtPct(restSum)}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { AssetLogo } from "@/components/AssetLogo";

const ASSET_COLOR: Record<string, string> = {
  real_estate: '#7A9C7F',
  crypto:      '#C47B5A',
  pension:     '#C4A86E',
  cash:        '#888780',
  stocks:      '#6B82A8',
  etf:         '#6B82A8',
  bonds:       '#C4A86E',
  gold:        '#C4A86E',
  other:       '#B4B2A9',
};

function colorFor(type: string): string {
  return ASSET_COLOR[type] ?? ASSET_COLOR.other;
}

function fmtPct(v: number): string {
  if (v < 0) return "−" + Math.abs(v).toFixed(1) + "%";
  return v.toFixed(1) + "%";
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

const LABEL_W = 88;
const BAR_H = 9;
const ROW_GAP = 7;
const HEADER_H = 18;

export function ConcentrationBars({ positions }: Props) {
  const sorted = [...positions].sort((a, b) => b.pct - a.pct);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (sorted.length === 0) return null;

  const top5 = sorted.slice(0, 5);
  const rest = sorted.slice(5);
  const top1Pct = sorted[0].pct;
  const axisMax = Math.max(50, Math.ceil((top1Pct + 10) / 10) * 10);
  // Threshold fraction of the track width (0–1)
  const threshFrac = 35 / axisMax;
  // CSS calc expression: left edge of threshold line from the container left
  const threshLeft = `calc(${LABEL_W}px + ${threshFrac.toFixed(6)} * (100% - ${LABEL_W}px))`;

  const restCount = rest.length;
  const restSum = rest.reduce((s, p) => s + p.pct, 0);

  return (
    <div style={{ paddingTop: HEADER_H, position: "relative" }}>
      {/* Threshold label — floats above the dashed line */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: threshLeft,
          transform: "translateX(-50%)",
          fontSize: 9,
          fontWeight: 500,
          color: "var(--text-faint)",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          letterSpacing: "0.02em",
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
            borderLeft: "1px dashed rgba(28,28,24,0.25)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        {top5.map((pos, i) => {
          const barWidthPct = (pos.pct / axisMax) * 100;
          const label = pos.symbol ?? pos.name;

          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                minHeight: BAR_H + 8,
                marginBottom: i < top5.length - 1 ? ROW_GAP : 0,
                position: "relative",
                zIndex: 1,
              }}
            >
              {/* Label column — small leading asset icon (the same AssetLogo used
                  in holdings rows and detail headers) + name. Top-aligned so a
                  two-line name keeps the icon beside its first line. The bar start
                  (LABEL_W) is unchanged. */}
              <div
                style={{
                  flexShrink: 0,
                  width: LABEL_W,
                  paddingRight: 10,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <AssetLogo type={pos.type} symbol={pos.symbol ?? null} name={pos.name} size={18} />
                <div
                  style={{
                    minWidth: 0,
                    fontSize: 11,
                    lineHeight: 1.3,
                    color: "var(--text-dim)",
                    overflowWrap: "break-word",
                    wordBreak: "normal",
                  }}
                >
                  {label}
                </div>
              </div>

              {/* Bar + % label */}
              <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
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
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 10.5,
                    color: "var(--text-dim)",
                    fontFeatureSettings: "'tnum'",
                    flexShrink: 0,
                    lineHeight: 1,
                  }}
                >
                  {fmtPct(pos.pct)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Overflow summary — not a bar, keeps the staircase silhouette clean */}
      {restCount > 0 && (
        <div
          style={{
            marginTop: ROW_GAP + 1,
            paddingLeft: LABEL_W,
            fontSize: 10.5,
            color: "var(--text-faint)",
            fontFeatureSettings: "'tnum'",
            lineHeight: 1,
          }}
        >
          +{restCount} more · {fmtPct(restSum)}
        </div>
      )}
    </div>
  );
}

"use client";

import { formatDate } from "@/lib/utils";
import { STARTING_POSITION_CTX } from "@/lib/diary-utils";

interface DiaryRowContentProps {
  logo: React.ReactNode;
  name: string;
  nameColor: string;
  valueNode: React.ReactNode;
  date: string;
  personalContext?: string | null;
  marketContext?: string | null;
  subtitle?: React.ReactNode;
  footer?: React.ReactNode;
}

export function DiaryRowContent({
  logo, name, nameColor, valueNode, date,
  personalContext, marketContext,
  subtitle, footer,
}: DiaryRowContentProps) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "8px 0", alignItems: "flex-start" }}>
      {logo}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, color: nameColor }}>
            {name}
          </span>
          <span style={{ flexShrink: 0, display: "flex", alignItems: "baseline", gap: 6 }}>
            {valueNode}
            <span style={{ fontSize: 13, color: "var(--text-faint)", fontFeatureSettings: '"tnum" 1', whiteSpace: "nowrap" }}>
              {formatDate(date)}
            </span>
          </span>
        </div>
        {subtitle}
        {personalContext && (
          <div
            className="font-serif"
            style={{
              fontStyle: "italic", fontSize: 13,
              color: "var(--text-dim)", lineHeight: 1.4,
              fontVariationSettings: "'opsz' 14",
            }}
          >
            {personalContext === STARTING_POSITION_CTX ? "Started tracking from today." : personalContext}
          </div>
        )}
        {marketContext && (
          <div style={{ marginTop: personalContext ? 6 : 0, display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
            <span
              className="font-mono uppercase"
              style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--text-faint)", flexShrink: 0 }}
            >
              Markets
            </span>
            <span style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.4 }}>
              {marketContext}
            </span>
          </div>
        )}
        {footer}
      </div>
    </div>
  );
}

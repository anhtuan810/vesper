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
    <div style={{ display: "flex", gap: 10, padding: "6px 0", alignItems: "flex-start" }}>
      {logo}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 1 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, color: nameColor, lineHeight: 1.2 }}>
            {name}
          </span>
          <span style={{ flexShrink: 0, display: "flex", alignItems: "baseline", gap: 6 }}>
            {valueNode}
            <span style={{ fontSize: 12, color: "var(--text-faint)", fontFamily: "var(--mono)", fontFeatureSettings: '"tnum" 1', whiteSpace: "nowrap" }}>
              {formatDate(date)}
            </span>
          </span>
        </div>
        {subtitle}
        {personalContext && (
          <div
            className="font-serif"
            style={{
              fontStyle: "italic", fontSize: 12.5,
              color: "var(--text-dim)", lineHeight: 1.35,
              fontVariationSettings: "'opsz' 14",
            }}
          >
            {personalContext === STARTING_POSITION_CTX ? "Started tracking from today." : personalContext}
          </div>
        )}
        {marketContext && (
          <div style={{ marginTop: personalContext ? 5 : 0, display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
            <span
              className="font-mono uppercase"
              style={{ fontSize: 10.5, letterSpacing: "0.14em", color: "var(--text-faint)", flexShrink: 0 }}
            >
              Markets
            </span>
            <span style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.35 }}>
              {marketContext}
            </span>
          </div>
        )}
        {footer}
      </div>
    </div>
  );
}

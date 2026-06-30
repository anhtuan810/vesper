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
          <span style={{ flex: 1, minWidth: 0, fontSize: "var(--fs-body)", fontFamily: "var(--font-ui)", fontWeight: 500, color: nameColor, lineHeight: 1.2 }}>
            {name}
          </span>
          <span style={{ flexShrink: 0, display: "flex", alignItems: "baseline", gap: 6 }}>
            {valueNode}
            <span className="tnum" style={{ fontSize: "var(--fs-caption)", color: "var(--text-faint)", whiteSpace: "nowrap" }}>
              {formatDate(date)}
            </span>
          </span>
        </div>
        {subtitle}
        {personalContext && (
          <div
            className="font-display"
            style={{
              fontStyle: "italic", fontSize: "var(--fs-caption)",
              color: "var(--text-dim)", lineHeight: "var(--lh-body)",
              fontVariationSettings: "'opsz' 14",
            }}
          >
            {personalContext === STARTING_POSITION_CTX ? "Started tracking from today." : personalContext}
          </div>
        )}
        {marketContext && (
          <div style={{ marginTop: personalContext ? 5 : 0, display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
            <span
              className="eyebrow"
              style={{ flexShrink: 0 }}
            >
              Markets
            </span>
            <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-dim)", lineHeight: "var(--lh-snug)" }}>
              {marketContext}
            </span>
          </div>
        )}
        {footer}
      </div>
    </div>
  );
}

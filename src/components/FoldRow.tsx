"use client";

import { useId, type ReactNode } from "react";

// The ONE foldable row shared by Vitals and Profile — the same fold gesture the
// journal entry, holdings groups and library already speak. Rests as two lines:
// the row's name over a plain-language line saying what it measures, with its
// figure (and a status word / sub-label) on the right. Tapping unfolds the body
// (chart, explanation), which rises in with the existing reduced-motion-gated
// `lookback-rise` keyframe; closing is instant — opening is the event.
export interface FoldRowProps {
  title: string;
  /** Plain-language line under the title — what this row answers. */
  question: string;
  /** The folded figure (right-aligned). */
  value: ReactNode;
  valueTone?: "default" | "negative";
  /** Small line under the figure: a status word (ok/warn) or a quiet sub-label. */
  sub?: ReactNode;
  subTone?: "ok" | "warn" | "neutral";
  open: boolean;
  onToggle: () => void;
  /** First row after a section header — drops its top hairline. */
  first?: boolean;
  children: ReactNode;
}

export function FoldRow({
  title, question, value, valueTone = "default", sub, subTone = "neutral",
  open, onToggle, first = false, children,
}: FoldRowProps) {
  const bodyId = useId();
  return (
    <div style={{ borderTop: first ? "none" : "1px solid var(--border)" }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="focus-ring"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          width: "100%",
          textAlign: "left",
          background: "none",
          border: "none",
          padding: "13px 0",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: "var(--fs-body)", fontWeight: 500, color: "var(--text)", lineHeight: "var(--lh-snug)", fontFamily: "var(--font-ui)" }}>
            {title}
          </span>
          <span style={{ display: "block", fontSize: "var(--fs-caption)", color: "var(--text-faint)", marginTop: 2, lineHeight: "var(--lh-snug)", fontFamily: "var(--font-ui)" }}>
            {question}
          </span>
        </span>
        <span style={{ flex: "none", textAlign: "right" }}>
          <span
            className="tnum"
            style={{
              display: "block",
              fontSize: "var(--fs-subhead)",
              fontWeight: 600,
              letterSpacing: "var(--tracking-subhead)",
              color: valueTone === "negative" ? "var(--negative-text)" : "var(--hero)",
              lineHeight: "var(--lh-tight)",
            }}
          >
            {value}
          </span>
          {sub != null && (
            <span
              className={subTone === "neutral" ? "tnum" : undefined}
              style={{
                display: "block",
                fontSize: "var(--fs-micro)",
                fontWeight: subTone === "neutral" ? 500 : 600,
                marginTop: 2,
                color: subTone === "ok" ? "var(--positive-text)" : subTone === "warn" ? "var(--negative-text)" : "var(--text-dim)",
                lineHeight: "var(--lh-tight)",
              }}
            >
              {sub}
            </span>
          )}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
          style={{
            flex: "none",
            color: "var(--text-faint)",
            opacity: 0.65,
            transition: "transform 0.25s ease",
            transform: open ? "rotate(180deg)" : "none",
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div id={bodyId} className="lookback-rise" style={{ paddingBottom: "var(--space-5)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

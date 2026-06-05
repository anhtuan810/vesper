"use client";

import type { CSSProperties, ReactNode } from "react";

// Shared editorial "scenario cue" line — the affordance that replaced the
// saturated "What if?" pill on both the portfolio hero and the mortgage card.
// The statement is ink; the trailing clause and the arrow are accent green and
// form the visible affordance. The whole line is a single tap/keyboard target
// that opens the existing scenario flow (a native <button>: role=button,
// focusable, Enter/Space activation for free). On hover/press the arrow nudges
// right ~2px — no fill, no inversion, no scale-pop.
export function ScenarioCueLine({
  statement,
  clause,
  ariaLabel,
  onActivate,
  style,
}: {
  statement?: ReactNode;
  clause: string;
  ariaLabel: string;
  onActivate: () => void;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onActivate}
      aria-label={ariaLabel}
      className="group font-serif rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      style={{
        display: "block",
        textAlign: "left",
        width: "100%",
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
        fontStyle: "italic",
        fontSize: 14.5,
        lineHeight: 1.5,
        color: "var(--text)",
        letterSpacing: "0.005em",
        ...style,
      }}
    >
      {statement}
      <span style={{ color: "var(--accent)" }}>
        {clause}{" "}
        <span
          aria-hidden="true"
          className="inline-block transition-transform duration-200 group-hover:translate-x-[2px] group-active:translate-x-[2px]"
          style={{ fontStyle: "normal" }}
        >
          →
        </span>
      </span>
    </button>
  );
}

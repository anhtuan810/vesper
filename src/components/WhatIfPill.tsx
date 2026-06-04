"use client";

// Reusable sage-filled "What if?" pill — the entry point to scenario simulation.
// Accent (sage) fill, cream text, consistent with the private-banker aesthetic.
export function WhatIfPill({
  onClick,
  style,
}: {
  onClick: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="What if?"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: "var(--accent)",
        color: "var(--bg)",
        border: "none",
        borderRadius: 999,
        cursor: "pointer",
        padding: "7px 14px",
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: "0.01em",
        fontFamily: "var(--font-sans)",
        WebkitTapHighlightColor: "transparent",
        ...style,
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      What if?
    </button>
  );
}

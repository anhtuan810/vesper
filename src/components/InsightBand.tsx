"use client";

import { useRouter } from "next/navigation";
import { useInsight } from "@/lib/hooks";
import type { ReactNode } from "react";

/** Parse *asterisk-marked* phrases into React nodes with <em> tags. */
function renderWithEmphasis(text: string): ReactNode {
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

export function InsightBand() {
  const { detail, loading } = useInsight();
  const router = useRouter();

  // Render nothing while loading or when no insight is available
  if (loading || !detail) return null;

  return (
    <div
      className="-mx-4 sm:-mx-8 mb-5"
      style={{
        position: "relative",
        padding: "14px 52px 14px 16px",
        background: "var(--accent-soft)",
        cursor: "pointer",
      }}
      onClick={() => router.push("/chat")}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") router.push("/chat"); }}
    >
      {/* Eyebrow */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--accent-text)",
          opacity: 0.7,
          marginBottom: 6,
        }}
      >
        Worth knowing
      </div>

      {/* Body — serif, normal weight; emphasis via <em> */}
      <div
        className="font-serif"
        style={{
          fontSize: 16,
          fontWeight: 400,
          lineHeight: 1.35,
          letterSpacing: "-0.005em",
          color: "var(--text)",
          fontVariationSettings: "'opsz' 18",
        }}
      >
        {renderWithEmphasis(detail)}
      </div>

      {/* Chevron */}
      <svg
        viewBox="0 0 256 256"
        fill="none"
        stroke="currentColor"
        strokeWidth={20}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          position: "absolute",
          top: 18,
          right: 22,
          width: 12,
          height: 12,
          color: "var(--accent-text)",
          opacity: 0.5,
        }}
      >
        <polyline points="96 48 176 128 96 208" />
      </svg>
    </div>
  );
}

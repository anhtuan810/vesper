"use client";

import { useState } from "react";
import { SIGNAL_TEXT_STYLE } from "@/components/SwipeExpandCarousel";

export interface PulseBannerProps {
  dateLabel: string;
  sentence: string;
  metaLabel?: string;
  /** Drives the heartbeat draw-in. A host that has already consumed the
   *  once-per-session flag (usePulseTraceOnce) passes its value here so the
   *  flag isn't double-read. Omitted → standalone: the banner reads it itself. */
  animate?: boolean;
}

// Escapes the Haiku sentence and converts *emphasis* to classed spans:
// .pulse-em for nouns (bold italic, stays in the voice serif), plus .pulse-fig
// when the span carries a digit — figures switch to the instrument sans and
// render in plate-gold (see globals.css .pulse-plate rules).
export function toSafeHtml(raw: string): string {
  const escaped = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return escaped.replace(/\*([^*]+)\*/g, (_m, inner: string) => {
    const cls = /\d/.test(inner) ? "pulse-em pulse-fig" : "pulse-em";
    return `<em class="${cls}">${inner}</em>`;
  });
}

// The heartbeat hairline across the plate. pathLength=1 lets the draw-once
// animation (globals.css .pulse-trace.animate) run without measuring.
export function PulseTrace({ animate }: { animate: boolean }) {
  return (
    <svg
      className={animate ? "pulse-trace animate" : "pulse-trace"}
      viewBox="0 0 320 12"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path pathLength="1" d="M0,8 L96,8 L104,8 L110,2 L117,11 L123,8 L320,8" />
    </svg>
  );
}

// Draw the trace only on the first Vitals visit of the session — a revisit
// shows it at rest. SSR-safe: the flag is only read in the client initializer,
// and the Pulse renders after data lands, so hydration never sees the plate.
export function usePulseTraceOnce(): boolean {
  const [animate] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      if (sessionStorage.getItem("volnar:pulse-trace")) return false;
      sessionStorage.setItem("volnar:pulse-trace", "1");
      return true;
    } catch {
      return true;
    }
  });
  return animate;
}

// Desktop/standalone Pulse: the same plate as the mobile band, kept as a
// rounded card so it sits in the desktop rail.
export function PulseBanner({ dateLabel, sentence, metaLabel, animate }: PulseBannerProps) {
  const tracedOnce = usePulseTraceOnce();
  const shouldAnimate = animate ?? tracedOnce;
  return (
    <div
      className="pulse-plate"
      style={{
        margin: "0 0 10px",
        padding: "10px 15px 11px",
        borderRadius: "var(--radius-lg)",
      }}
    >
      {/* Header row carries the heartbeat trace between the dateline and the
          meta label — the trace costs no extra vertical space. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 5,
        }}
      >
        <div
          className="eyebrow"
          style={{
            color: "var(--plate-gold)",
            opacity: 0.85,
            whiteSpace: "nowrap",
          }}
        >
          {dateLabel}
        </div>
        <div style={{ flex: 1, minWidth: 0, color: "var(--plate-gold)" }}>
          <PulseTrace animate={shouldAnimate} />
        </div>
        {metaLabel && (
          <div
            className="eyebrow"
            style={{
              color: "var(--plate-dim)",
              whiteSpace: "nowrap",
            }}
          >
            {metaLabel}
          </div>
        )}
      </div>
      <div
        style={{ ...SIGNAL_TEXT_STYLE, color: "var(--plate-text)" }}
        dangerouslySetInnerHTML={{ __html: toSafeHtml(sentence) }}
      />
    </div>
  );
}

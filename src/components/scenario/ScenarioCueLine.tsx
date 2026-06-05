"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import {
  trackChipInteraction,
  trackChipImpression,
  markImpression,
  type ChipEventPayload,
} from "@/lib/chip-telemetry";

// Shared editorial "scenario cue" line — the affordance that replaced the
// saturated "What if?" pill on both the portfolio hero and the mortgage card.
// The statement is ink; the trailing clause and the arrow are accent green and
// form the visible affordance. The whole line is a single tap/keyboard target
// that opens the existing scenario flow (a native <button>: role=button,
// focusable, Enter/Space activation for free). On hover/press the arrow nudges
// right ~2px — no fill, no inversion, no scale-pop.
//
// Telemetry: when `telemetryTemplate` is supplied, the line emits chip telemetry
// on the 'scenario_cue' surface. It is a scenario chip (sendRawLabel = false), so
// only the stable template id is sent — never the rendered sentence, which
// carries user-derived figures (years, deltas).
export function ScenarioCueLine({
  statement,
  clause,
  ariaLabel,
  onActivate,
  style,
  telemetryTemplate,
  impressionKey,
}: {
  statement?: ReactNode;
  clause: string;
  ariaLabel: string;
  onActivate: () => void;
  style?: CSSProperties;
  telemetryTemplate?: string;
  /** Per-instance discriminator for the impression dedup key only (e.g. asset
   *  id). NOT added to the analytics payload — it just lets distinct instances
   *  (two property mortgage lines) each log their own impression in a session. */
  impressionKey?: string;
}) {
  const payload: ChipEventPayload | null = telemetryTemplate
    ? { surface: "scenario_cue", chipType: "scenario", position: 0, labelTemplate: telemetryTemplate }
    : null;

  const impressionFired = useRef(false);
  useEffect(() => {
    if (!payload || impressionFired.current) return;
    impressionFired.current = true;
    // No message id on this surface — dedup on surface + template, plus an
    // optional per-instance key so each instance logs once per session.
    if (markImpression(`scenario_cue:${payload.labelTemplate}:${impressionKey ?? ""}`)) {
      trackChipImpression(payload);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = () => {
    if (payload) trackChipInteraction(payload);
    onActivate();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
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

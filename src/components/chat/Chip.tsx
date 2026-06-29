"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import {
  trackChipInteraction,
  trackChipImpression,
  markImpression,
  type ChipSurface,
  type ChipType,
  type ChipEventPayload,
} from "@/lib/chip-telemetry";

// Shared chat chip. Renders the existing inline-button markup verbatim (the
// caller passes the same `style`/`className` it used before, so chips are
// visually identical), and centralizes chip telemetry: one chip_interaction per
// tap, one chip_impression per rendered display (session-deduped).
export interface ChipProps {
  label: string;
  surface: ChipSurface;
  chipType: ChipType;
  labelTemplate: string;
  sendRawLabel: boolean;
  position: number;
  seedKind?: string;
  /** Real message id (goes into the event); omit for seeds/empty/scenario. */
  messageId?: string;
  /** Local-only fallback for the impression dedup key when messageId is absent. */
  contentHash?: string;
  onTap: (label: string) => void;
  /** 'accent' fills the chip with the soft accent band; default is the elevated surface. */
  tone?: "default" | "accent";
  style?: CSSProperties;
  className?: string;
}

export function Chip({
  label,
  surface,
  chipType,
  labelTemplate,
  sendRawLabel,
  position,
  seedKind,
  messageId,
  contentHash,
  onTap,
  tone = "default",
  style,
  className,
}: ChipProps) {
  const payload: ChipEventPayload = {
    surface,
    chipType,
    position,
    labelTemplate,
    ...(sendRawLabel ? { label } : {}),
    ...(seedKind != null ? { seedKind } : {}),
    ...(messageId != null ? { messageId } : {}),
  };

  // Fire chip_impression once per rendered display. The ref guards against the
  // effect re-running; markImpression guards across re-mounts within the session.
  const impressionFired = useRef(false);
  useEffect(() => {
    if (impressionFired.current) return;
    impressionFired.current = true;
    const key = `${surface}:${messageId ?? contentHash ?? ""}:${position}:${labelTemplate}`;
    if (markImpression(key)) trackChipImpression(payload);
    // payload is derived from these stable props; fire strictly once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = () => {
    trackChipInteraction(payload);
    onTap(label);
  };

  // The chip's one owned spec on the design-system tokens. Callers can still
  // override individual properties via `style` (it wins via spread order).
  const baseStyle: CSSProperties = {
    height: 32,
    padding: "0 var(--space-3)",
    borderRadius: "var(--radius-pill)",
    border: "0.5px solid var(--border)",
    fontSize: "var(--fs-body)",
    background: tone === "accent" ? "var(--accent-soft)" : "var(--surface-elev)",
    color: tone === "accent" ? "var(--accent-text)" : "var(--text)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  return (
    <button
      type="button"
      className={className}
      style={{ ...baseStyle, ...style }}
      onClick={handleClick}
    >
      {label}
    </button>
  );
}

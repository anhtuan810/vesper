"use client";

import { useId } from "react";

// Property "owned share" icon: a hollow house silhouette filled with accent green
// from the bottom up to `ownedFraction` of the house's height. Purely
// presentational — the parent computes the fraction; this only draws.
//
// Each instance generates a unique clipPath id via useId(): a shared/static id
// would make every icon in a list clip to the first instance's path, bleeding
// fills across rows.
export function HouseFillIcon({
  ownedFraction,
  size = 24,
}: {
  ownedFraction: number;
  size?: number;
}) {
  const clipId = useId();

  // House silhouette: vertical extent y=3..21 (height 18).
  const HOUSE = "M12 3 L21 10.5 L21 21 L3 21 L3 10.5 Z";
  const HOUSE_TOP = 3;
  const HOUSE_HEIGHT = 18;

  // Render a fill only when we have finite data and something to fill. A
  // non-finite fraction (no value/mortgage data) draws the outline alone.
  const finite = Number.isFinite(ownedFraction);
  const f = finite ? Math.max(0, Math.min(1, ownedFraction)) : 0;
  const fillHeight = f * HOUSE_HEIGHT;
  const fillY = HOUSE_TOP + HOUSE_HEIGHT - fillHeight; // fill from the bottom up

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--accent)"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {finite && f > 0 && (
        <>
          <defs>
            <clipPath id={clipId}>
              <path d={HOUSE} />
            </clipPath>
          </defs>
          <rect
            x={0}
            y={fillY}
            width={24}
            height={fillHeight}
            fill="var(--accent)"
            stroke="none"
            clipPath={`url(#${clipId})`}
          />
        </>
      )}
      {/* Silhouette outline on top so the unpaid portion reads as a hollow house. */}
      <path d={HOUSE} />
    </svg>
  );
}

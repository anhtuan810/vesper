import type { ReactNode } from "react";

interface EyebrowProps {
  n?: string;
  children: ReactNode;
  light?: boolean;
  center?: boolean;
}

// App-style tracked micro-label above section headlines — mirrors the
// uppercase section labels in the product ("HOLDINGS", "PERSPECTIVE").
export function Eyebrow({ n, children, light, center }: EyebrowProps) {
  return (
    <div
      className="mkt-eyebrow reveal"
      data-light={light ? "" : undefined}
      data-center={center ? "" : undefined}
    >
      {n && <span className="mkt-eyebrow-n">{n}</span>}
      <span className="mkt-eyebrow-rule" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

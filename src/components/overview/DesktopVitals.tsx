"use client";

import { VitalsContent } from "@/components/vitals/VitalsContent";

// Desktop Vitals — the Twilight design over the live vitals. Reuses VitalsContent
// in its grid layout (the Pulse banner, the rich per-vital charts, and the
// library), framed by the Twilight section header. Mobile keeps the stacked
// VitalsContent unchanged.
export function DesktopVitals() {
  return (
    <>
      <div className="sec-top" style={{ marginBottom: 20 }}>
        <div>
          <span className="eyebrow">Vitals</span>
        </div>
      </div>
      <VitalsContent layout="grid" showHeader={false} renderToggleInline />
    </>
  );
}

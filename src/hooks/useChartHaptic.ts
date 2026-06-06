import { useCallback, useRef } from "react";
import { isNative } from "@/lib/platform";

let hapticsModule: typeof import("@capacitor/haptics") | null = null;

async function getHaptics() {
  if (hapticsModule) return hapticsModule;
  hapticsModule = await import("@capacitor/haptics");
  return hapticsModule;
}

/**
 * Returns a fire(index) function. Call it with the current scrub index.
 * - On native (iOS / Android): fires ImpactStyle.Light via @capacitor/haptics.
 * - On web: fires navigator.vibrate(6) if available.
 * - Fires only when the index actually changes (no repeat on same point).
 * - Silent no-op when prefers-reduced-motion: reduce is set.
 * - Never throws.
 */
export function useChartHaptic() {
  const lastIndex = useRef<number | null>(null);

  return useCallback((index: number | null) => {
    if (index === null) { lastIndex.current = null; return; }
    if (index === lastIndex.current) return;
    lastIndex.current = index;

    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    if (isNative()) {
      getHaptics()
        .then(({ Haptics, ImpactStyle }) =>
          Haptics.impact({ style: ImpactStyle.Light })
        )
        .catch(() => {});
    } else if (typeof navigator?.vibrate === "function") {
      navigator.vibrate(6);
    }
  }, []);
}

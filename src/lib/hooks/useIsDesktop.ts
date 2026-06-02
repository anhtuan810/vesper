"use client";

import { useState, useEffect } from "react";

type CapacitorWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean };
};

/**
 * True only on the web (NOT inside the Capacitor native app) at viewports
 * >= 1024px (Tailwind `lg`). The iOS app is always treated as mobile, even on
 * a large iPad.
 *
 * Client-only: returns `undefined` before mount so callers can render a neutral
 * full-height background until the real value is known — this avoids both a
 * hydration mismatch and a layout flash.
 */
export function useIsDesktop(): boolean | undefined {
  const [isDesktop, setIsDesktop] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    // Capacitor native is always mobile, regardless of viewport size.
    const isNative =
      (window as CapacitorWindow).Capacitor?.isNativePlatform?.() === true;
    if (isNative) {
      setIsDesktop(false);
      return;
    }

    const mql = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return isDesktop;
}

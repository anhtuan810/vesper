"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@/lib/hooks/user";
import { fetchAndCacheVitals, vitalsCacheIsFresh } from "@/lib/hooks/vitals";

/**
 * Warms the Vitals cache at idle so the first in-session navigation to /vitals
 * paints instantly from cache instead of showing a skeleton. Renders nothing and
 * touches no layout; it just populates the exact sessionStorage + module caches
 * useVitals already reads. Mounted once, app-wide, under UserProvider.
 *
 * It is deliberately polite: it bails when there's nothing to warm or warming is
 * pointless (already on /vitals, no user yet, tab hidden, or a fresh cache
 * exists), and it schedules the actual fetch at idle so it never competes with
 * the landing surface's own critical requests.
 */
export function VitalsPrefetch() {
  const { user } = useUser();
  const userId = user?.id;
  const pathname = usePathname();

  useEffect(() => {
    if (!userId) return; // wait for auth
    if (pathname === "/vitals") return; // that page's own useVitals owns it
    if (document.visibilityState !== "visible") return; // don't warm a hidden tab
    if (vitalsCacheIsFresh(userId)) return; // a fresh warm cache already exists for this user

    let cancelled = false;
    const warm = () => {
      if (cancelled) return;
      // Non-forced: dedupes against a navigation that may already be fetching.
      // Errors are a silent no-op — behavior falls back to on-demand fetch.
      fetchAndCacheVitals(userId).catch(() => {});
    };

    // Idle-schedule so the warm fires AFTER the landing surface's requests.
    // requestIdleCallback isn't available on iOS WebKit, so fall back to a timer.
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(warm, { timeout: 2000 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback?.(id);
      };
    }

    const id = window.setTimeout(warm, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [userId, pathname]);

  return null;
}

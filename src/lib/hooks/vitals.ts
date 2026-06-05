"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { VitalResult } from "@/lib/vitals/index";
import { usePortfolioRevision } from "@/lib/portfolio-revision";

export const VITALS_CACHE_TTL_MS = 3_600_000; // 1 hour

export interface VitalsResponse {
  vitals: VitalResult[];
  pulse: string | null;
  pulseLiquid: string | null;
  netWorthEur: number;
  displayCurrency: string;
  assets: Array<{ name: string; type: string; eurValue: number; symbol?: string }>;
}

let _vitalsCache: { data: VitalsResponse; fetchedAt: number } | null = null;

// Drops the module-level Vitals cache so the next read re-fetches. Called from the
// mutation path so a freshly-mounted Vitals surface never serves a pre-mutation
// (e.g. "no property yet") Pulse from cache.
export function invalidateVitalsCache(): void {
  _vitalsCache = null;
}

export function useVitals() {
  const revision = usePortfolioRevision();
  const [data, setData] = useState<VitalsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback((force: boolean) => {
    if (
      !force &&
      _vitalsCache &&
      Date.now() - _vitalsCache.fetchedAt < VITALS_CACHE_TTL_MS
    ) {
      setData(_vitalsCache.data);
      setIsLoading(false);
      return;
    }

    // A forced read (after a mutation or on tab focus) bypasses BOTH the 1-hour
    // client cache (force) and any HTTP/edge cache (no-store + a unique query
    // param), so the server-regenerated body/Pulse is actually retrieved.
    const suffix = force ? `?rev=${Date.now()}` : "";

    // The Pulse arrives on its own slower channel; we merge it whenever it lands,
    // whether that's before or after the body resolves.
    let pulsePayload: Pick<VitalsResponse, "pulse" | "pulseLiquid"> | null = null;
    let bodyReady = false;
    const mergePulse = () => {
      if (!pulsePayload) return;
      const merge = pulsePayload;
      setData((prev) => (prev ? { ...prev, ...merge } : prev));
      if (_vitalsCache) {
        _vitalsCache = {
          data: { ..._vitalsCache.data, ...merge },
          fetchedAt: _vitalsCache.fetchedAt,
        };
      }
    };

    // Body — deterministic, fast. As soon as it resolves the page can paint, so
    // this is what clears isLoading. Pulse fields start null and fill in later.
    fetch(`/api/vitals${suffix}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Omit<VitalsResponse, "pulse" | "pulseLiquid">>;
      })
      .then((body) => {
        const merged: VitalsResponse = { ...body, pulse: null, pulseLiquid: null };
        _vitalsCache = { data: merged, fetchedAt: Date.now() };
        setData(merged);
        setError(null);
        bodyReady = true;
        mergePulse();
      })
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setIsLoading(false));

    // Pulse — slow (Haiku). Failure must never block the body or trip the page
    // error state; we simply leave the pulse null.
    fetch(`/api/vitals/pulse${suffix}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Pick<VitalsResponse, "pulse" | "pulseLiquid">>;
      })
      .then((p) => {
        pulsePayload = { pulse: p.pulse ?? null, pulseLiquid: p.pulseLiquid ?? null };
        if (bodyReady) mergePulse();
      })
      .catch(() => {
        /* swallow — the body already rendered; the Pulse slot stays a shimmer */
      });
  }, []);

  // Initial mount respects the cache; every later revision bump forces a refresh.
  const mounted = useRef(false);
  useEffect(() => {
    const force = mounted.current;
    mounted.current = true;
    load(force);
  }, [revision, load]);

  // Refresh when the tab regains focus.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") load(true);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  return { data, isLoading, error };
}

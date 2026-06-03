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
    // param), so the server-regenerated Pulse is actually retrieved.
    const url = force ? `/api/vitals?rev=${Date.now()}` : "/api/vitals";
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<VitalsResponse>;
      })
      .then((d) => {
        _vitalsCache = { data: d, fetchedAt: Date.now() };
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setIsLoading(false));
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

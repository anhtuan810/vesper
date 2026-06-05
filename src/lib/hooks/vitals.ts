"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { VitalResult } from "@/lib/vitals/index";
import { usePortfolioRevision } from "@/lib/portfolio-revision";
import { useUser } from "./user";
import { VITALS_CACHE_PREFIX, vitalsCacheKey } from "@/lib/constants";

export const VITALS_CACHE_TTL_MS = 3_600_000; // 1 hour — module-cache freshness
export const VITALS_SWR_STALE_MS = 60_000; // focus revalidates at most once/min

export interface VitalsResponse {
  vitals: VitalResult[];
  pulse: string | null;
  pulseLiquid: string | null;
  netWorthEur: number;
  displayCurrency: string;
  assets: Array<{ name: string; type: string; eurValue: number; symbol?: string }>;
}

// Module-level cache survives client-side nav (but not a full page reload — that's
// what the per-user sessionStorage mirror below is for).
let _vitalsCache: { data: VitalsResponse; fetchedAt: number } | null = null;

function readSessionVitals(userId: string): VitalsResponse | null {
  try {
    const raw = sessionStorage.getItem(vitalsCacheKey(userId));
    return raw ? (JSON.parse(raw) as VitalsResponse) : null;
  } catch { return null; }
}

function writeSessionVitals(userId: string, data: VitalsResponse): void {
  try { sessionStorage.setItem(vitalsCacheKey(userId), JSON.stringify(data)); } catch {}
}

function cacheStale(ms: number): boolean {
  return !_vitalsCache || Date.now() - _vitalsCache.fetchedAt >= ms;
}

// Drops the module-level Vitals cache AND every per-user sessionStorage mirror so
// the next read re-fetches. Called from the mutation path so a freshly-mounted
// Vitals surface never serves a pre-mutation (e.g. "no property yet") Pulse.
export function invalidateVitalsCache(): void {
  _vitalsCache = null;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(VITALS_CACHE_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {}
}

export function useVitals() {
  const revision = usePortfolioRevision();
  const { user, loading: userLoading } = useUser();
  const userId = user?.id;

  const [data, setData] = useState<VitalsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // dataRef mirrors `data` so async fetch handlers and the focus listener can read
  // "do we already have something to show?" without re-subscribing on every change.
  const dataRef = useRef<VitalsResponse | null>(null);

  // Paint cached data instantly (no network write, no skeleton). Used by the
  // sessionStorage/module hydration paths.
  const paint = useCallback((d: VitalsResponse) => {
    dataRef.current = d;
    setData(d);
    setIsLoading(false);
  }, []);

  // Commit freshly-fetched data: paint it and persist to both caches.
  const commit = useCallback((d: VitalsResponse, uid: string | undefined) => {
    dataRef.current = d;
    setData(d);
    setIsLoading(false);
    _vitalsCache = { data: d, fetchedAt: Date.now() };
    if (uid) writeSessionVitals(uid, d);
  }, []);

  // Background fetch of body + pulse. Never clears data; on failure it keeps the
  // existing data (only a cold start with nothing to show surfaces an error).
  const load = useCallback((force: boolean, uid: string | undefined) => {
    // Cache-bust only the genuinely-forced paths (revision bump, stale focus
    // revalidate) so the server-regenerated pulse is actually retrieved.
    const suffix = force ? `?rev=${Date.now()}` : "";

    let pulsePayload: Pick<VitalsResponse, "pulse" | "pulseLiquid"> | null = null;
    let bodyDone = false;
    const mergePulse = () => {
      if (!pulsePayload) return;
      const prev = dataRef.current;
      if (!prev) return;
      commit({ ...prev, ...pulsePayload }, uid);
    };

    // Body — deterministic, fast. On a background refetch (data already present)
    // we keep the existing pulse visible until the fresh one lands, so the banner
    // never flashes back to a shimmer.
    fetch(`/api/vitals${suffix}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Omit<VitalsResponse, "pulse" | "pulseLiquid">>;
      })
      .then((body) => {
        const prev = dataRef.current;
        const next: VitalsResponse = prev
          ? { ...prev, ...body }
          : { ...body, pulse: null, pulseLiquid: null };
        commit(next, uid);
        setError(null);
        bodyDone = true;
        mergePulse();
      })
      .catch((e) => {
        // Keep showing existing data; only a true cold start surfaces the error.
        if (!dataRef.current) setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => setIsLoading(false));

    // Pulse — slow (Haiku). Failure must never block the body, trip the error
    // state, or clear data; we simply leave the pulse as-is.
    fetch(`/api/vitals/pulse${suffix}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Pick<VitalsResponse, "pulse" | "pulseLiquid">>;
      })
      .then((p) => {
        pulsePayload = { pulse: p.pulse ?? null, pulseLiquid: p.pulseLiquid ?? null };
        if (bodyDone) mergePulse();
      })
      .catch(() => {
        /* swallow — the body already rendered; the Pulse slot stays a shimmer */
      });
  }, [commit]);

  // Decide what to show on mount / revision bump / auth resolution. Every branch
  // that has data to show paints it WITHOUT a skeleton; only a genuine cold start
  // (nothing cached anywhere) leaves isLoading=true while the first body is in
  // flight.
  const boot = useCallback(
    (revisionChanged: boolean, uid: string | undefined, authLoading: boolean) => {
      // 1. We already have data in memory (client-side nav, or a prior fetch in
      //    this hook): never revert to a skeleton.
      if (dataRef.current) {
        if (revisionChanged) {
          load(true, uid); // post-mutation: swap numbers in place
        } else {
          if (uid) writeSessionVitals(uid, dataRef.current); // backfill if uid arrived late
          if (cacheStale(VITALS_SWR_STALE_MS)) load(true, uid);
        }
        return;
      }

      // 2. userId known: try the sessionStorage mirror, then the module cache,
      //    then a cold fetch.
      if (uid) {
        const cached = readSessionVitals(uid);
        if (cached) {
          _vitalsCache = { data: cached, fetchedAt: 0 }; // mark stale so we revalidate
          paint(cached);
          load(true, uid); // silent background revalidate
          return;
        }
        if (_vitalsCache && Date.now() - _vitalsCache.fetchedAt < VITALS_CACHE_TTL_MS) {
          paint(_vitalsCache.data);
          writeSessionVitals(uid, _vitalsCache.data);
          if (revisionChanged) load(true, uid);
          return;
        }
        load(false, uid); // true cold start (skeleton stays until body lands)
        return;
      }

      // 3. userId not known yet. Wait for auth to resolve before deciding (so a
      //    hard reload can paint from sessionStorage once uid arrives). If auth
      //    has resolved with no user, fetch anyway — it 401s into the error state,
      //    matching prior behavior.
      if (authLoading) return;
      load(false, undefined);
    },
    [load, paint],
  );

  // Initial mount + every revision bump + auth resolution.
  const prevRevision = useRef(revision);
  useEffect(() => {
    const revisionChanged = prevRevision.current !== revision;
    prevRevision.current = revision;
    boot(revisionChanged, userId, userLoading);
  }, [revision, userId, userLoading, boot]);

  // Tab return: SILENT, throttled background revalidate. Never a skeleton, never
  // clears data, and no request at all if the last fetch was under the threshold.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!dataRef.current) return; // nothing behind it; the mount path owns cold load
      if (!cacheStale(VITALS_SWR_STALE_MS)) return; // throttle
      load(true, userId);
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, userId]);

  return { data, isLoading, error };
}

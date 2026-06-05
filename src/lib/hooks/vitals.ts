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

type VitalsBody = Omit<VitalsResponse, "pulse" | "pulseLiquid">;
type VitalsPulse = Pick<VitalsResponse, "pulse" | "pulseLiquid">;

// Module-level cache survives client-side nav (but not a full page reload — that's
// what the per-user sessionStorage mirror below is for).
let _vitalsCache: { data: VitalsResponse; fetchedAt: number } | null = null;

// In-flight non-forced fetches, keyed by userId, so a prefetch and a navigation
// that race collapse onto a single request instead of two.
const _inflight = new Map<string, Promise<VitalsResponse | null>>();

function readSessionVitals(userId: string): VitalsResponse | null {
  try {
    const raw = sessionStorage.getItem(vitalsCacheKey(userId));
    return raw ? (JSON.parse(raw) as VitalsResponse) : null;
  } catch { return null; }
}

function writeSessionVitals(userId: string, data: VitalsResponse): void {
  try { sessionStorage.setItem(vitalsCacheKey(userId), JSON.stringify(data)); } catch {}
}

function writeCaches(userId: string | undefined, data: VitalsResponse): void {
  _vitalsCache = { data, fetchedAt: Date.now() };
  if (userId) writeSessionVitals(userId, data);
}

function cacheStale(ms: number): boolean {
  return !_vitalsCache || Date.now() - _vitalsCache.fetchedAt >= ms;
}

// Whether a warm Vitals cache exists and is younger than `ms`. Reuses the same
// staleness logic/threshold the focus revalidate uses, so the idle prefetcher
// doesn't duplicate the number — it just skips warming when a fresh cache is
// already present.
export function vitalsCacheIsFresh(ms: number = VITALS_SWR_STALE_MS): boolean {
  return !cacheStale(ms);
}

// The single loader, shared by useVitals and the idle prefetcher. Fetches the
// body and pulse in parallel, merges the pulse in when it lands, swallows a pulse
// failure (the body still resolves), and writes the merged response to BOTH the
// module cache and the per-user sessionStorage mirror. Optional progress hooks let
// useVitals paint the body before the (slow) pulse arrives; the prefetcher omits
// them and just warms the caches.
//
// A forced read (revision bump / stale focus revalidate) bypasses the in-flight
// dedupe and always runs, with ?rev= + no-store so the regenerated pulse is
// actually retrieved. Rejects on body failure; pulse failure is silent.
function runVitalsFetch(
  userId: string | undefined,
  force: boolean,
  onBody?: (body: VitalsBody) => void,
  onPulse?: (pulse: VitalsPulse) => void,
): Promise<VitalsResponse | null> {
  const suffix = force ? `?rev=${Date.now()}` : "";

  let merged: VitalsResponse | null = null;
  let pulsePayload: VitalsPulse = { pulse: null, pulseLiquid: null };

  const bodyPromise = fetch(`/api/vitals${suffix}`, { cache: "no-store" })
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<VitalsBody>;
    })
    .then((body) => {
      onBody?.(body);
      merged = { ...body, ...pulsePayload };
      writeCaches(userId, merged);
    });

  const pulsePromise = fetch(`/api/vitals/pulse${suffix}`, { cache: "no-store" })
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<VitalsPulse>;
    })
    .then((p) => {
      pulsePayload = { pulse: p.pulse ?? null, pulseLiquid: p.pulseLiquid ?? null };
      onPulse?.(pulsePayload);
      if (merged) {
        merged = { ...merged, ...pulsePayload };
        writeCaches(userId, merged);
      }
    })
    .catch(() => {
      /* swallow — the body still resolves; the pulse stays null */
    });

  return bodyPromise.then(() => pulsePromise).then(() => merged);
}

export function fetchAndCacheVitals(
  userId: string | undefined,
  opts?: {
    force?: boolean;
    onBody?: (body: VitalsBody) => void;
    onPulse?: (pulse: VitalsPulse) => void;
  },
): Promise<VitalsResponse | null> {
  const force = opts?.force ?? false;

  // Dedupe only non-forced reads (the prefetch + first navigation case). A forced
  // read always starts its own request.
  if (!force && userId) {
    const existing = _inflight.get(userId);
    if (existing) return existing;
  }

  const promise = runVitalsFetch(userId, force, opts?.onBody, opts?.onPulse).finally(() => {
    if (userId && _inflight.get(userId) === promise) _inflight.delete(userId);
  });

  if (!force && userId) _inflight.set(userId, promise);
  return promise;
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

  // Background fetch of body + pulse via the shared loader. Never clears data; on
  // failure it keeps the existing data (only a cold start with nothing to show
  // surfaces an error). Caching is owned by the shared loader; these callbacks
  // only drive React state.
  const load = useCallback((force: boolean, uid: string | undefined) => {
    let progressivePainted = false;

    fetchAndCacheVitals(uid, {
      force,
      onBody: (body) => {
        progressivePainted = true;
        // On a background refetch (data already present) keep the existing pulse
        // visible until the fresh one lands, so the banner never flashes back to
        // a shimmer.
        const prev = dataRef.current;
        const next: VitalsResponse = prev
          ? { ...prev, ...body }
          : { ...body, pulse: null, pulseLiquid: null };
        dataRef.current = next;
        setData(next);
        setIsLoading(false);
        setError(null);
      },
      onPulse: (p) => {
        const prev = dataRef.current;
        if (!prev) return;
        const next = { ...prev, ...p };
        dataRef.current = next;
        setData(next);
      },
    })
      .then((result) => {
        // The progress callbacks fire only for a request THIS call started. When
        // we instead deduped onto an in-flight prefetch, paint the final merged
        // result so the navigation still renders. (Dedupe only happens on
        // non-forced cold loads, where there is no prior pulse to preserve.)
        if (!progressivePainted && result) {
          dataRef.current = result;
          setData(result);
          setError(null);
        }
      })
      .catch((e) => {
        // Keep showing existing data; only a true cold start surfaces the error.
        if (!dataRef.current) setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => setIsLoading(false));
  }, []);

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

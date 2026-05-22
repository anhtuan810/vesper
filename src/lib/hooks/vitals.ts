"use client";

import { useState, useEffect } from "react";
import type { VitalResult } from "@/lib/vitals/index";

export const VITALS_CACHE_TTL_MS = 3_600_000; // 1 hour

export interface VitalsResponse {
  vitals: VitalResult[];
  pulse: string | null;
  pulseLiquid: string | null;
  statStrip: {
    top1Pct: number | null;
    ltvPct: number | null;
    liquid1wPct: number | null;
    realYieldPct: number | null;
  };
  netWorthEur: number;
  displayCurrency: string;
  assets: Array<{ name: string; type: string; eurValue: number }>;
}

let _vitalsCache: { data: VitalsResponse; fetchedAt: number } | null = null;

export function useVitals() {
  const [data, setData] = useState<VitalsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (
      _vitalsCache &&
      Date.now() - _vitalsCache.fetchedAt < VITALS_CACHE_TTL_MS
    ) {
      setData(_vitalsCache.data);
      setIsLoading(false);
      return;
    }

    fetch("/api/vitals", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<VitalsResponse>;
      })
      .then((d) => {
        _vitalsCache = { data: d, fetchedAt: Date.now() };
        setData(d);
      })
      .catch((e) =>
        setError(e instanceof Error ? e : new Error(String(e)))
      )
      .finally(() => setIsLoading(false));
  }, []);

  return { data, isLoading, error };
}

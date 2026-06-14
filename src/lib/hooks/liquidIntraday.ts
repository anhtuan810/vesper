"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

export interface LiquidIntradayAsset {
  id: string;
  closes: Array<{ t: number; close: number }>;
}

export interface LiquidIntradayData {
  assets: LiquidIntradayAsset[];
}

// Fetches the per-asset 5m intraday close series for the liquid set
// (/api/liquid-intraday). Inert when `enabled` is false (not in the Liquid-only
// 1D view) — no request, cleared data. Mirrors the fetch pattern in
// hooks/prices.ts (usePriceHistory).
export function useLiquidIntraday(enabled: boolean): { data: LiquidIntradayData | null; isLoading: boolean } {
  const [data, setData] = useState<LiquidIntradayData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled) { setData(null); setIsLoading(false); return; } // eslint-disable-line react-hooks/set-state-in-effect
    let cancelled = false;
    setIsLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    apiFetch("/api/liquid-intraday")
      .then((r) => r.json())
      .then((body) => { if (!cancelled) setData({ assets: body.assets ?? [] }); })
      .catch((err) => { if (!cancelled) console.error("Liquid intraday fetch failed:", err); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [enabled]);

  return { data, isLoading };
}

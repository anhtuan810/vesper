"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

export interface LiquidIntradayAsset {
  id: string;
  // Day-open close (raw native units, same as `closes`) — yesterday's close, so
  // the line and the daily % start there and capture the stock open gap.
  dayOpen: number;
  closes: Array<{ t: number; close: number }>;
}

export interface LiquidIntradayData {
  // Epoch (seconds) of the ET trading-day start — the line's left edge.
  windowStart: number;
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
      .then((body) => { if (!cancelled) setData({ windowStart: body.windowStart ?? 0, assets: body.assets ?? [] }); })
      .catch((err) => { if (!cancelled) console.error("Liquid intraday fetch failed:", err); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [enabled]);

  return { data, isLoading };
}

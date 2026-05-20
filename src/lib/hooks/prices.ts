"use client";

import { useState, useEffect, useMemo } from "react";
import { normalizePrice } from "@/lib/prices";
import type { PriceResult, PricePoint } from "@/lib/prices-server";
import { readCachedSparklines, writeCachedSparklines } from "./assets";

export function usePriceHistory(symbol: string | null | undefined, range: string) {
  const [closes, setCloses] = useState<number[]>([]);
  const [timestamps, setTimestamps] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) { setCloses([]); setTimestamps([]); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/prices/history?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`)
      .then((r) => r.json())
      .then(({ data }) => {
        if (!cancelled) {
          const points = (data as PricePoint[] | undefined) ?? [];
          setCloses(points.map((p) => p.close));
          setTimestamps(points.map((p) => p.timestamp));
        }
      })
      .catch(() => { if (!cancelled) { setCloses([]); setTimestamps([]); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, range]);

  return { closes, timestamps, loading };
}

export function useSparklines(symbols: string[], range: string): Record<string, number[]> {
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});
  const symbolKey = useMemo(() => [...new Set(symbols)].sort().join(","), [symbols]);

  useEffect(() => {
    const unique = symbolKey.split(",").filter(Boolean);
    if (unique.length === 0) return;

    const cached = readCachedSparklines(symbolKey, range);
    if (cached) setSparklines(cached);

    let cancelled = false;
    fetch("/api/prices/history/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: unique, range }),
    })
      .then((r) => r.json())
      .then(({ data }) => {
        if (cancelled) return;
        const result: Record<string, number[]> = {};
        for (const [sym, points] of Object.entries(data as Record<string, PricePoint[]>)) {
          result[sym] = points.map((p) => p.close);
        }
        setSparklines(result);
        writeCachedSparklines(symbolKey, range, result);
      })
      .catch((err) => { console.error("Sparklines fetch failed:", err); });

    return () => { cancelled = true; };
  }, [symbolKey, range]);

  return sparklines;
}

export function useLivePrice(symbol: string | undefined) {
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [livePrev, setLivePrev] = useState<number | null>(null);
  const [nativePrice, setNativePrice] = useState<number | null>(null);
  const [nativeCurrency, setNativeCurrency] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    fetch(`/api/prices?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((data: PriceResult) => {
        if (!cancelled && !data.error) {
          setLivePrice(normalizePrice(data.price, data.nativeCurrency));
          setLivePrev(data.previousClose ?? null);
          setNativePrice(data.nativePrice ?? null);
          setNativeCurrency(data.nativeCurrency ?? null);
        }
      })
      .catch((err) => { console.error("Live price fetch failed:", err); });
    return () => { cancelled = true; };
  }, [symbol]);

  return { livePrice, livePrev, nativePrice, nativeCurrency };
}

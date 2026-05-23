"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createBrowserSupabase, type Asset, type LiveAsset, type RealEstateAsset } from "@/lib/supabase";
import { normalizePrice } from "@/lib/prices";
import type { PriceResult } from "@/lib/prices-server";
import {
  SPARKLINES_TTL_MS,
  PRICES_POLL_INTERVAL_MS,
  PRICES_SAFETY_TIMEOUT_MS,
  ASSETS_CACHE_PREFIX,
  SPARKLINES_CACHE_PREFIX,
  assetsCacheKey,
  sparklinesCacheKey,
  pricesTsCacheKey,
} from "@/lib/constants";

function assetsValueEqual(a: Asset[], b: Asset[]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((x) => [x.id, x]));
  return a.every((x) => {
    const y = byId.get(x.id);
    if (!y) return false;
    // Cast to RealEstateAsset to access mortgage fields; undefined on non-RE types, which compares equal.
    const xr = x as RealEstateAsset;
    const yr = y as RealEstateAsset;
    return (
      x.value === y.value &&
      x.units === y.units &&
      x.symbol === y.symbol &&
      x.currency === y.currency &&
      x.type === y.type &&
      xr.mortgage_balance === yr.mortgage_balance &&
      xr.mortgage_balance_recorded_at === yr.mortgage_balance_recorded_at &&
      xr.mortgage_rate === yr.mortgage_rate &&
      xr.monthly_payment === yr.monthly_payment &&
      xr.mortgage_type === yr.mortgage_type
    );
  });
}

function readCachedAssets(userId: string): Asset[] | null {
  try {
    const raw = sessionStorage.getItem(assetsCacheKey(userId));
    return raw ? (JSON.parse(raw) as Asset[]) : null;
  } catch { return null; }
}

function writeCachedAssets(userId: string, assets: Asset[]) {
  try { sessionStorage.setItem(assetsCacheKey(userId), JSON.stringify(assets)); } catch {}
}

export function invalidateAssetsCache(userId: string) {
  try { sessionStorage.removeItem(assetsCacheKey(userId)); } catch {}
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(SPARKLINES_CACHE_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {}
}

export function readCachedSparklines(symbolKey: string, range: string): Record<string, number[]> | null {
  try {
    const raw = sessionStorage.getItem(sparklinesCacheKey(symbolKey, range));
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: Record<string, number[]>; ts: number };
    return Date.now() - ts < SPARKLINES_TTL_MS ? data : null;
  } catch { return null; }
}

export function writeCachedSparklines(symbolKey: string, range: string, data: Record<string, number[]>) {
  try { sessionStorage.setItem(sparklinesCacheKey(symbolKey, range), JSON.stringify({ data, ts: Date.now() })); } catch {}
}

function readPriceTimestamp(userId: string): Date | null {
  try {
    const raw = sessionStorage.getItem(pricesTsCacheKey(userId));
    return raw ? new Date(Number(raw)) : null;
  } catch { return null; }
}

function writePriceTimestamp(userId: string) {
  try { sessionStorage.setItem(pricesTsCacheKey(userId), String(Date.now())); } catch {}
}

export function useAssets(userId: string | undefined) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceResult>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pricesLoaded, setPricesLoaded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [priceHealth, setPriceHealth] = useState<"healthy" | "degraded" | null>(null);
  const supabase = createBrowserSupabase();

  useEffect(() => {
    if (!userId) return;
    const cached = readCachedAssets(userId);
    if (cached) {
      setAssets(cached);
      setLoading(false);
      if (!cached.some((a) => a.symbol)) setPricesLoaded(true);
    }
    const ts = readPriceTimestamp(userId);
    if (ts) setLastUpdated(ts);
  }, [userId]);

  const fetchAssets = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("assets")
      .select("*")
      .eq("user_id", userId)
      .order("value", { ascending: false });
    if (error) { setError(true); setLoading(false); return; }
    const next = data || [];
    setAssets((prev) => assetsValueEqual(prev, next) ? prev : next);
    setLoading(false);
    writeCachedAssets(userId, next);
    if (!next.some((a) => a.symbol)) {
      setPricesLoaded(true);
    }
  }, [userId]);

  const fetchPrices = useCallback(async () => {
    const seen = new Map<string, { symbol: string; country: string | null }>();
    assets.filter((a) => a.symbol).forEach((a) => {
      if (!seen.has(a.symbol!)) seen.set(a.symbol!, { symbol: a.symbol!, country: a.country ?? null });
    });
    const items = [...seen.values()];
    if (items.length === 0) return;

    setRefreshing(true);
    const timer = setTimeout(() => setPricesLoaded(true), PRICES_SAFETY_TIMEOUT_MS);
    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: items }),
      });
      const data = await res.json();
      const priceMap: Record<string, PriceResult> = {};
      (data.prices as PriceResult[])?.forEach((p) => {
        if (!p.error) priceMap[p.requested_symbol ?? p.symbol] = p;
      });
      setPrices(priceMap);
      const now = new Date();
      setLastUpdated(now);
      if (userId) writePriceTimestamp(userId);
      const successCount = Object.keys(priceMap).length;
      const healthRatio = items.length > 0 ? successCount / items.length : 1;
      setPriceHealth(healthRatio < 0.5 ? "degraded" : "healthy");

      const stale = assets.filter(
        (asset) =>
          asset.symbol &&
          priceMap[asset.symbol] &&
          priceMap[asset.symbol].nativeCurrency &&
          (priceMap[asset.symbol].nativeCurrency !== asset.currency ||
            priceMap[asset.symbol].symbol !== asset.symbol)
      );
      if (stale.length > 0) {
        await Promise.all(
          stale.map((asset) => {
            const p = priceMap[asset.symbol!];
            const update: Record<string, unknown> = {};
            if (asset.units) update.value = Math.round(p.price * asset.units);
            if (p.symbol !== asset.symbol) update.symbol = p.symbol;
            if (p.nativeCurrency !== asset.currency) update.currency = p.nativeCurrency;
            return supabase
              .from("assets")
              .update(update)
              .eq("id", asset.id)
              .then(() => undefined);
          })
        );
        await fetchAssets();
      }
    } catch {
      setPriceHealth("degraded");
    } finally {
      clearTimeout(timer);
      setRefreshing(false);
      setPricesLoaded(true);
    }
  }, [assets, fetchAssets, supabase]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  const symbolKey = assets.map((a) => a.symbol ?? "").join(",");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (assets.length > 0) fetchPrices(); }, [symbolKey, fetchPrices]);

  useEffect(() => {
    if (assets.length === 0) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchPrices();
      }
    }, PRICES_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchPrices, assets.length]);

  const liveAssets = useMemo<LiveAsset[]>(
    () => assets.map((a) => {
      if (a.symbol && a.units && prices[a.symbol]) {
        const p = prices[a.symbol];
        const nativeValue = Math.round(p.price * a.units);
        return {
          ...a,
          value: nativeValue,
          currency: p.nativeCurrency,
          livePrice: p.price,
          livePrev: p.previousClose,
          nativePrice: p.nativePrice,
          nativeCurrency: p.nativeCurrency,
        };
      }
      return a;
    }),
    [assets, prices]
  );

  return {
    assets: liveAssets,
    rawAssets: assets,
    loading,
    error,
    refreshing,
    pricesLoaded,
    lastUpdated,
    priceHealth,
    refreshPrices: fetchPrices,
    refetchAssets: fetchAssets,
    setAssets,
  };
}

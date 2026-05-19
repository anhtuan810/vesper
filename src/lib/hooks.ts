"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createBrowserSupabase, type Asset, type LiveAsset } from "@/lib/supabase";
import { useThemeContext } from "@/components/ThemeProvider";
import { useUserContext } from "@/components/UserProvider";
import { normalizePrice } from "@/lib/prices";
import type { PriceResult, PricePoint } from "@/lib/prices-server";
import {
  type DisplayCurrency,
  type FxFreshness,
  isSupportedCurrency,
  setUsdRate,
  getUsdRate,
  getRateFreshness,
  fetchUsdRate,
} from "@/lib/money";
import {
  SPARKLINES_TTL_MS,
  PRICES_POLL_INTERVAL_MS,
  PRICES_SAFETY_TIMEOUT_MS,
  INSIGHT_CACHE_TTL_MS,
  ASSETS_CACHE_PREFIX,
  SPARKLINES_CACHE_PREFIX,
  assetsCacheKey,
  sparklinesCacheKey,
  pricesTsCacheKey,
} from "@/lib/constants";

export interface ProfileData {
  name?: string;
  avatar_url?: string | null;
  fingerprint?: string | null;
  profile?: Record<string, string>;
}

export function useUser() {
  return useUserContext();
}

export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const supabase = createBrowserSupabase();

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("users")
      .select("name, avatar_url, fingerprint, profile")
      .eq("id", userId)
      .single()
      .then(({ data }) => setProfile(data));
  }, [userId]);

  return profile;
}

function readCachedAssets(userId: string): Asset[] | null {
  try {
    const raw = sessionStorage.getItem(assetsCacheKey(userId));
    return raw ? (JSON.parse(raw) as Asset[]) : null;
  } catch { return null; }
}
function writeCachedAssets(userId: string, assets: Asset[]) {
  // TODO: BroadcastChannel for cross-tab invalidation — this is single-tab safe only
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

function readCachedSparklines(symbolKey: string, range: string): Record<string, number[]> | null {
  try {
    const raw = sessionStorage.getItem(sparklinesCacheKey(symbolKey, range));
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: Record<string, number[]>; ts: number };
    return Date.now() - ts < SPARKLINES_TTL_MS ? data : null;
  } catch { return null; }
}
function writeCachedSparklines(symbolKey: string, range: string, data: Record<string, number[]>) {
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

  // Hydrate from cache instantly when userId first becomes available
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
    setAssets(data || []);
    setLoading(false);
    writeCachedAssets(userId, data || []);
    // No tradeable assets means fetchPrices will never fire — mark prices as loaded immediately
    if (!(data || []).some((a) => a.symbol)) {
      setPricesLoaded(true);
    }
  }, [userId]);

  const fetchPrices = useCallback(async () => {
    // Build deduped {symbol, country} list — first occurrence wins when a symbol spans multiple assets
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
      // Key by requested_symbol so the lookup matches what the asset row has stored,
      // even when the resolver rewrote the symbol (e.g. ZPRR → ZPRR.DE).
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

      // Self-heal: if Yahoo's resolved symbol or currency differs from what the DB has stored,
      // update the asset so the stored values stay coherent with what Yahoo returns.
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
        // Re-fetch so the local state reflects corrected symbol/currency tags
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
        // p.price is the native Yahoo price (not USD-converted); value stays in native currency.
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

    // Hydrate from cache instantly; revalidate in background
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
          // normalizePrice handles only the GBp edge case; price is already USD-converted
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

export function useFxRate(currency: DisplayCurrency): { rate: number; freshness: FxFreshness } {
  const [, tick] = useState(0);  // force re-render when fetch resolves

  useEffect(() => {
    if (currency === "USD") return;
    // Skip fetch if rate is already fresh
    if (getRateFreshness(currency) === "fresh") return;
    let cancelled = false;
    fetchUsdRate(currency).then((rate) => {
      if (!cancelled && rate !== null) tick((n) => n + 1);
    });
    return () => { cancelled = true; };
  }, [currency]);

  return { rate: getUsdRate(currency), freshness: getRateFreshness(currency) };
}

export function useDisplayCurrency(): DisplayCurrency {
  return useDisplayCurrencyState().currency;
}

export function useDisplayCurrencyState(): { currency: DisplayCurrency; loaded: boolean } {
  const { user, loading: userLoading } = useUser();
  const [currency, setCurrency] = useState<DisplayCurrency>("USD");
  const [loaded, setLoaded] = useState(false);
  const supabase = createBrowserSupabase();

  useEffect(() => {
    if (userLoading) return;
    if (!user?.id) { setLoaded(true); return; }
    supabase
      .from("users")
      .select("display_currency")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.display_currency && isSupportedCurrency(data.display_currency)) {
          setCurrency(data.display_currency as DisplayCurrency);
        }
        setLoaded(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, userLoading]);

  const { freshness } = useFxRate(currency);

  const fullyLoaded = loaded && (currency === "USD" || freshness !== "unavailable");

  return { currency, loaded: fullyLoaded };
}

export function useTheme() {
  return useThemeContext();
}

export function useSignOut() {
  const supabase = createBrowserSupabase();

  return useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, [supabase]);
}

// Module-level session cache — survives re-renders, cleared on page reload
let _insightCache: { detail: string | null; fetchedAt: number } | null = null;

export function primeInsightCache(detail: string | null) {
  if (detail !== null) {
    _insightCache = { detail, fetchedAt: Date.now() };
  }
}

export function invalidateInsightCache() {
  _insightCache = null;
  // Best-effort: purge the server-side DB cache so the next fetch regenerates from current assets.
  fetch("/api/insight", { method: "DELETE" }).catch(() => {});
}

export function useInsight() {
  const [detail, setDetail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (_insightCache && Date.now() - _insightCache.fetchedAt < INSIGHT_CACHE_TTL_MS) {
      setDetail(_insightCache.detail);
      setLoading(false);
      return;
    }

    // cache: "no-store" bypasses the browser HTTP cache so a cleared _insightCache always hits the server.
    fetch("/api/insight", { cache: "no-store" })
      .then((r) => r.json())
      .then(({ detail }: { detail: string | null }) => {
        _insightCache = { detail, fetchedAt: Date.now() };
        setDetail(detail);
      })
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, []);

  return { detail, loading };
}

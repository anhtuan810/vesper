"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { User } from "@supabase/supabase-js";
import { createBrowserSupabase, type Asset, type LiveAsset } from "@/lib/supabase";
import { normalizePrice } from "@/lib/prices";
import type { PriceResult, PricePoint } from "@/lib/prices-server";
import {
  type DisplayCurrency,
  type FxFreshness,
  isSupportedCurrency,
  setEurRate,
  getEurRate,
  getRateFreshness,
} from "@/lib/money";

export interface ProfileData {
  name?: string;
  avatar_url?: string;
  profile?: Record<string, string>;
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createBrowserSupabase();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });
  }, []);

  return { user, loading };
}

export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const supabase = createBrowserSupabase();

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("users")
      .select("name, avatar_url, profile")
      .eq("id", userId)
      .single()
      .then(({ data }) => setProfile(data));
  }, [userId]);

  return profile;
}

export function useAssets(userId: string | undefined) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceResult>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const supabase = createBrowserSupabase();

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
  }, [userId]);

  const fetchPrices = useCallback(async () => {
    const symbols = [...new Set(assets.filter((a) => a.symbol).map((a) => a.symbol!))];
    if (symbols.length === 0) return;

    setRefreshing(true);
    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols }),
      });
      const data = await res.json();
      const priceMap: Record<string, PriceResult> = {};
      (data.prices as PriceResult[])?.forEach((p) => {
        if (!p.error) priceMap[p.symbol] = p;
      });
      setPrices(priceMap);
      setLastUpdated(new Date());

      // Self-heal: if Yahoo's reported currency differs from what the DB has stored,
      // update both currency AND value so they stay coherent.
      const stale = assets.filter(
        (asset) =>
          asset.symbol &&
          priceMap[asset.symbol] &&
          priceMap[asset.symbol].nativeCurrency &&
          priceMap[asset.symbol].nativeCurrency !== asset.currency
      );
      if (stale.length > 0) {
        await Promise.all(
          stale.map((asset) =>
            supabase
              .from("assets")
              .update({ currency: priceMap[asset.symbol!].nativeCurrency })
              .eq("id", asset.id)
              .then(() => undefined)
          )
        );
        // Re-fetch so the local state reflects corrected currency tags
        await fetchAssets();
      }
    } catch {
      // Prices stay as manual values
    } finally {
      setRefreshing(false);
    }
  }, [assets, fetchAssets, supabase]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  const symbolKey = assets.map((a) => a.symbol ?? "").join(",");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (assets.length > 0) fetchPrices(); }, [symbolKey, fetchPrices]);

  const liveAssets = useMemo<LiveAsset[]>(
    () => assets.map((a) => {
      if (a.symbol && a.units && prices[a.symbol]) {
        const p = prices[a.symbol];
        // p.price is already EUR-converted by /api/prices
        const eurValue = Math.round(p.price * a.units);
        return {
          ...a,
          value: eurValue,
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
    lastUpdated,
    refreshPrices: fetchPrices,
    refetchAssets: fetchAssets,
    setAssets,
  };
}

export function usePriceHistory(symbol: string | null | undefined, range: string) {
  const [closes, setCloses] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) { setCloses([]); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/prices/history?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`)
      .then((r) => r.json())
      .then(({ data }) => {
        if (!cancelled) {
          setCloses((data as PricePoint[] | undefined)?.map((p) => p.close) ?? []);
        }
      })
      .catch(() => { if (!cancelled) setCloses([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, range]);

  return { closes, loading };
}

export function useSparklines(symbols: string[], range: string): Record<string, number[]> {
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});
  const symbolKey = useMemo(() => [...new Set(symbols)].sort().join(","), [symbols]);

  useEffect(() => {
    const unique = symbolKey.split(",").filter(Boolean);
    if (unique.length === 0) return;
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
      })
      .catch(() => {});

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
          // normalizePrice handles only the GBp edge case; price is already EUR-converted
          setLivePrice(normalizePrice(data.price, data.nativeCurrency));
          setLivePrev(data.previousClose ?? null);
          setNativePrice(data.nativePrice ?? null);
          setNativeCurrency(data.nativeCurrency ?? null);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [symbol]);

  return { livePrice, livePrev, nativePrice, nativeCurrency };
}

export function useFxRate(currency: DisplayCurrency): { rate: number; freshness: FxFreshness } {
  const [, tick] = useState(0);  // force re-render when fetch resolves

  useEffect(() => {
    if (currency === "EUR") return;
    // Skip fetch if rate is already fresh
    if (getRateFreshness(currency) === "fresh") return;
    let cancelled = false;
    fetch(`/api/fx?base=EUR&quote=${currency}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && typeof data.rate === "number") {
          setEurRate(currency, data.rate);
          tick((n) => n + 1);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currency]);

  return { rate: getEurRate(currency), freshness: getRateFreshness(currency) };
}

export function useDisplayCurrency(): DisplayCurrency {
  const { user } = useUser();
  const [currency, setCurrency] = useState<DisplayCurrency>("EUR");
  const supabase = createBrowserSupabase();

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("users")
      .select("display_currency")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.display_currency && isSupportedCurrency(data.display_currency)) {
          setCurrency(data.display_currency as DisplayCurrency);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Trigger rate fetch and populate module-level cache as a side effect.
  useFxRate(currency);

  return currency;
}

export function useSignOut() {
  const supabase = createBrowserSupabase();

  return useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, [supabase]);
}

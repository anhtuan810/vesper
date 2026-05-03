"use client";

import { useState, useEffect, useCallback } from "react";
import { createBrowserSupabase, type Asset } from "@/lib/supabase";

// Hook: get current user
export function useUser() {
  const [user, setUser] = useState<any>(null);
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

// Hook: get user profile
export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<any>(null);
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

// Hook: get assets with live prices
export function useAssets(userId: string | undefined) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [prices, setPrices] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const supabase = createBrowserSupabase();

  const fetchAssets = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("assets")
      .select("*")
      .eq("user_id", userId)
      .order("value", { ascending: false });
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
      const priceMap: Record<string, any> = {};
      data.prices?.forEach((p: any) => {
        if (!p.error) priceMap[p.symbol] = p;
      });
      setPrices(priceMap);
      setLastUpdated(new Date());
    } catch {
      // Prices stay as manual values
    } finally {
      setRefreshing(false);
    }
  }, [assets]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  useEffect(() => {
    if (assets.length > 0) fetchPrices();
  }, [assets.length]);

  // Compute live values
  const liveAssets = assets.map((a) => {
    if (a.symbol && a.units && prices[a.symbol]) {
      const p = prices[a.symbol];
      let price = p.price;
      if (p.currency === "GBp") price = price / 100;
      return {
        ...a,
        value: Math.round(price * a.units),
        livePrice: price,
        livePrev: p.previousClose,
      } as Asset & { livePrice?: number; livePrev?: number };
    }
    return a as Asset & { livePrice?: number; livePrev?: number };
  });

  return {
    assets: liveAssets,
    rawAssets: assets,
    loading,
    refreshing,
    lastUpdated,
    refreshPrices: fetchPrices,
    refetchAssets: fetchAssets,
    setAssets,
  };
}

// Hook: sign out
export function useSignOut() {
  const supabase = createBrowserSupabase();

  return async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };
}

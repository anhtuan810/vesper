"use client";

import { useState, useEffect, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { createBrowserSupabase, type Asset, type LiveAsset } from "@/lib/supabase";
import { normalizePrice } from "@/lib/prices";

interface PriceData {
  symbol: string;
  price: number;
  previousClose: number;
  currency: string;
  error?: string;
}

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
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
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
      const priceMap: Record<string, PriceData> = {};
      (data.prices as PriceData[])?.forEach((p) => {
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

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  const symbolKey = assets.map((a) => a.symbol ?? "").join(",");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (assets.length > 0) fetchPrices(); }, [symbolKey, fetchPrices]);

  const liveAssets: LiveAsset[] = assets.map((a) => {
    if (a.symbol && a.units && prices[a.symbol]) {
      const p = prices[a.symbol];
      const price = normalizePrice(p.price, p.currency);
      return { ...a, value: Math.round(price * a.units), livePrice: price, livePrev: p.previousClose };
    }
    return a;
  });

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

export function useSignOut() {
  const supabase = createBrowserSupabase();

  return async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };
}

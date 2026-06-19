"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import { isNativeBuild } from "@/lib/api";
import { usePortfolioRevision } from "@/lib/portfolio-revision";
import { useThemeContext } from "@/components/ThemeProvider";
import { useUserContext } from "@/components/UserProvider";
import {
  type DisplayCurrency,
  type FxFreshness,
  isSupportedCurrency,
  getUsdRate,
  getRateFreshness,
  fetchUsdRate,
} from "@/lib/money";
import { PRICES_SAFETY_TIMEOUT_MS } from "@/lib/constants";

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
  const revision = usePortfolioRevision();

  const fetchProfile = useCallback(() => {
    if (!userId) return;
    supabase
      .from("users")
      .select("name, avatar_url, fingerprint, profile")
      .eq("id", userId)
      .single()
      .then(({ data }) => setProfile(data));
    // supabase client is a stable browser singleton — intentionally omitted from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Re-read on mount and whenever a mutation bumps the revision — the Context
  // prose is regenerated server-side during the chat turn, so a refetch surfaces
  // it (lazily, on the next Profile load) without touching generation logic.
  useEffect(() => { fetchProfile(); }, [fetchProfile, revision]);

  // Re-read when the tab regains focus.
  useEffect(() => {
    if (!userId) return;
    const onFocus = () => {
      if (document.visibilityState === "visible") fetchProfile();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [userId, fetchProfile]);

  return profile;
}

export function useFxRate(currency: DisplayCurrency): { rate: number; freshness: FxFreshness } {
  const [, tick] = useState(0);

  useEffect(() => {
    if (currency === "USD") return;
    if (getRateFreshness(currency) === "fresh") return;
    let cancelled = false;
    fetchUsdRate(currency).then((rate) => {
      if (!cancelled && rate !== null) tick((n) => n + 1);
    });
    return () => { cancelled = true; };
  }, [currency]);

  return { rate: getUsdRate(currency), freshness: getRateFreshness(currency) };
}

export function useDisplayCurrencyState(): { currency: DisplayCurrency; loaded: boolean } {
  const { user, loading: userLoading } = useUser();
  const [currency, setCurrency] = useState<DisplayCurrency>("USD");
  const [loaded, setLoaded] = useState(false);
  const supabase = createBrowserSupabase();

  useEffect(() => {
    if (userLoading) return;
    if (!user?.id) { setLoaded(true); return; }
    let settled = false;
    const settle = () => { if (!settled) { settled = true; setLoaded(true); } };
    const timer = setTimeout(settle, PRICES_SAFETY_TIMEOUT_MS);
    supabase
      .from("users")
      .select("display_currency")
      .eq("id", user.id)
      .single()
      .then(
        ({ data }) => {
          if (data?.display_currency && isSupportedCurrency(data.display_currency)) {
            setCurrency(data.display_currency as DisplayCurrency);
          }
          settle();
        },
        () => { settle(); }
      );
    return () => { clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, userLoading]);

  const { freshness } = useFxRate(currency);
  const fullyLoaded = loaded && (currency === "USD" || freshness !== "unavailable");

  return { currency, loaded: fullyLoaded };
}

export function useDisplayCurrency(): DisplayCurrency {
  return useDisplayCurrencyState().currency;
}

export function useTheme() {
  return useThemeContext();
}

export function useSignOut() {
  const supabase = createBrowserSupabase();
  const router = useRouter();
  const { beginSignOut } = useUserContext();

  return useCallback(async () => {
    // Cover the app before the round-trip: signOut() revokes server-side first and
    // only then clears the local session (and fires SIGNED_OUT), so the main screen
    // would otherwise linger for the duration of that call.
    beginSignOut();
    await supabase.auth.signOut();
    if (isNativeBuild) {
      // Clear the RevenueCat identity so the next account signing in on this device
      // doesn't inherit this user's appUserID (native sign-out is an SPA navigation,
      // so the SDK stays in memory). Best-effort and non-blocking — the next sign-in
      // re-identifies via logIn regardless, so we never make the user wait on it.
      import("@/lib/native/purchases")
        .then(({ logOutPurchases }) => logOutPurchases())
        .catch(() => {});
      // SPA navigation: in the bundled app a full load of /login would be
      // served the root index.html. UserProvider purges caches on SIGNED_OUT.
      router.replace("/login");
    } else {
      // Full reload on the web wipes all in-memory state across the app.
      window.location.href = "/login";
    }
  }, [supabase, router, beginSignOut]);
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import * as Sentry from "@sentry/nextjs";
import { useUserContext } from "@/components/UserProvider";
import { apiFetch, isNativeBuild } from "@/lib/api";
import { isNative } from "@/lib/platform";
import type { SubscriptionView } from "@/lib/subscription";

interface SubscriptionContextValue {
  // The server's view of the entitlement, or null before it loads / when signed out.
  data: SubscriptionView | null;
  // True until the first status read resolves (so the paywall never flashes).
  loading: boolean;
  // Whether the app is unlocked: the server's verdict, or an optimistic local
  // unlock right after a native purchase/restore (before the webhook lands).
  entitled: boolean;
  refresh: () => Promise<SubscriptionView | null>;
  // Poll the status a few times until entitled — used after a native
  // purchase/restore so the server entitlement (written by the webhook) is picked
  // up even if it lands a few seconds late, instead of relying on the optimistic
  // unlock alone (which would re-gate the user on the next cold start).
  refreshUntilEntitled: () => Promise<SubscriptionView | null>;
  markEntitledOptimistic: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextValue>({
  data: null,
  loading: true,
  entitled: false,
  refresh: async () => null,
  refreshUntilEntitled: async () => null,
  markEntitledOptimistic: () => {},
});

export function useSubscription(): SubscriptionContextValue {
  return useContext(SubscriptionContext);
}

// Holds the signed-in user's subscription status, fetched from the authed
// endpoint. The server is the source of truth; this provider only reads it. It
// also configures RevenueCat on native and reconciles the return from Stripe
// Checkout on web.
export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, loading: userLoading } = useUserContext();
  const [data, setData] = useState<SubscriptionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [optimistic, setOptimistic] = useState(false);

  const fetchStatus = useCallback(async (): Promise<SubscriptionView | null> => {
    try {
      const res = await apiFetch("/api/subscription");
      if (!res.ok) {
        setData(null);
        return null;
      }
      const view = (await res.json()) as SubscriptionView;
      setData(view);
      return view;
    } catch {
      setData(null);
      return null;
    }
  }, []);

  // Load on sign-in; clear on sign-out. Optimistic unlock is reset on any user
  // change so a previous account's unlock can't carry over. State is set inside
  // the async callback (not the effect body) to avoid cascading synchronous renders.
  useEffect(() => {
    if (userLoading) return;
    let cancelled = false;
    (async () => {
      setOptimistic(false);
      if (!user) {
        setData(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      await fetchStatus();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, userLoading, fetchStatus]);

  // Re-read the entitlement when the app regains focus / becomes visible, so a
  // change made while the app was backgrounded — a cancel in the Stripe billing
  // portal, a Dashboard edit, or a webhook that lands a moment later — is reflected
  // without a manual reload. Mirrors the chart/diary focus-refresh on the dashboard.
  // Optimistic unlock is untouched (entitled = optimistic || data.entitled), so a
  // refetch right after a native purchase can't re-gate the user.
  useEffect(() => {
    if (!user) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchStatus();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, fetchStatus]);

  // Native: configure RevenueCat with the Supabase user id so the paywall can
  // load offerings and purchase, and every purchase maps to the account. The SDK
  // is loaded only here (dynamic import), never in the web bundle.
  useEffect(() => {
    if (!isNative() || !user) return;
    // Report configure failures instead of swallowing them: a failed configure
    // leaves the SDK on an anonymous app user id, so a subsequent purchase maps to
    // a non-account id the webhook can't resolve and never persists server-side.
    import("@/lib/native/purchases")
      .then(({ configurePurchases }) =>
        configurePurchases(user.id).catch((e) =>
          Sentry.captureException(e, { tags: { area: "revenuecat-configure" } }),
        ),
      )
      .catch((e) => Sentry.captureException(e, { tags: { area: "revenuecat-configure-import" } }));
  }, [user]);

  // Web: returning from Stripe Checkout (?checkout=success), poll until the
  // webhook has written the entitlement, then clean the URL so a refresh doesn't
  // re-trigger the poll.
  useEffect(() => {
    if (isNativeBuild || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;

    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clean = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      window.history.replaceState({}, "", url.pathname + url.search);
    };
    const poll = async () => {
      const view = await fetchStatus();
      tries += 1;
      if (view?.entitled || tries >= 6) {
        clean();
        return;
      }
      timer = setTimeout(poll, 1500);
    };
    poll();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [fetchStatus]);

  const refresh = useCallback(() => fetchStatus(), [fetchStatus]);

  const refreshUntilEntitled = useCallback(async (): Promise<SubscriptionView | null> => {
    const TRIES = 5;
    const DELAY_MS = 1500;
    for (let i = 0; i < TRIES; i++) {
      const view = await fetchStatus();
      if (view?.entitled) return view;
      if (i < TRIES - 1) await new Promise((r) => setTimeout(r, DELAY_MS));
    }
    return null;
  }, [fetchStatus]);

  const markEntitledOptimistic = useCallback(() => setOptimistic(true), []);

  const entitled = optimistic || (data?.entitled ?? false);

  return (
    <SubscriptionContext.Provider
      value={{ data, loading, entitled, refresh, refreshUntilEntitled, markEntitledOptimistic }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

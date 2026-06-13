"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
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
  markEntitledOptimistic: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextValue>({
  data: null,
  loading: true,
  entitled: false,
  refresh: async () => null,
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

  // Native: configure RevenueCat with the Supabase user id so the paywall can
  // load offerings and purchase, and every purchase maps to the account. The SDK
  // is loaded only here (dynamic import), never in the web bundle.
  useEffect(() => {
    if (!isNative() || !user) return;
    import("@/lib/native/purchases")
      .then(({ configurePurchases }) => configurePurchases(user.id).catch(() => {}))
      .catch(() => {});
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
  const markEntitledOptimistic = useCallback(() => setOptimistic(true), []);

  const entitled = optimistic || (data?.entitled ?? false);

  return (
    <SubscriptionContext.Provider
      value={{ data, loading, entitled, refresh, markEntitledOptimistic }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

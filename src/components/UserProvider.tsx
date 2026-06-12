"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/lib/supabase";
import { isNativeBuild } from "@/lib/api";
import { CHAT_HISTORY_PREFIX } from "@/lib/constants";
import { resetPortfolioRevision } from "@/lib/portfolio-revision";

interface UserContextValue {
  user: User | null;
  loading: boolean;
  // The one-time AI disclosure acknowledgment timestamp. `undefined` while it is
  // still being loaded (so the gate never flashes), `null` once loaded and not
  // yet acknowledged, or an ISO string once acknowledged.
  aiConsentAt: string | null | undefined;
  // Optimistically record the acknowledgment locally once the POST succeeds, so
  // the gate dismisses immediately without a refetch.
  markAiConsent: (at?: string) => void;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  loading: true,
  aiConsentAt: undefined,
  markAiConsent: () => {},
});

export function useUserContext(): UserContextValue {
  return useContext(UserContext);
}

// Wipes every client-side cache that holds account figures so no value from a
// previous account can render against the next session. sessionStorage SWR /
// bootstrap mirrors (assets, prices, vitals, diary, profile baseline, plus
// transient handoffs) all live under the `volnar`/`vitals.` namespaces; chat
// history is the only account data in localStorage. The module-level in-memory
// caches (vitals, insight) are userId-tagged and self-invalidate, and the
// portfolio-revision counter is reset by the caller.
function purgeClientCaches(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && (k.startsWith("volnar") || k.startsWith("vitals."))) toRemove.push(k);
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {}
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CHAT_HISTORY_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {}
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiConsentAt, setAiConsentAt] = useState<string | null | undefined>(undefined);

  // Last authenticated user id we've seen on this client. `undefined` means "not
  // resolved yet" (so the first resolution is never treated as a switch).
  const lastSeenUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createBrowserSupabase();

    const loadConsent = (client: SupabaseClient, userId: string) => {
      client
        .from("users")
        .select("ai_consent_at")
        .eq("id", userId)
        .single()
        .then(({ data }) => setAiConsentAt(data?.ai_consent_at ?? null));
    };

    // Initial resolution (preserves prior behavior; no purge on first load).
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
      lastSeenUserId.current = user?.id ?? null;
      if (user) loadConsent(supabase, user.id);
    });

    // React to every later auth transition. On sign-out, or whenever the user id
    // changes from the last-seen value (account switch, including via /demo in the
    // same WebView), purge all cached figures and reset in-memory stores BEFORE the
    // new user's surfaces read anything — so no prior-account value can bleed
    // through without a manual hard refresh.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const newId = session?.user?.id ?? null;
      const prevId = lastSeenUserId.current;
      const switched = prevId !== undefined && newId !== prevId;

      if (event === "SIGNED_OUT" || switched) {
        purgeClientCaches();
        resetPortfolioRevision();
        setAiConsentAt(undefined);
      }

      lastSeenUserId.current = newId;
      setUser(session?.user ?? null);
      setLoading(false);

      // Only (re)load the acknowledgment flag on an actual switch — not on a
      // routine token refresh, which would needlessly refetch and could briefly
      // re-show the AI gate if it raced a just-submitted acknowledgment.
      if (switched && session?.user) loadConsent(supabase, session.user.id);
      else if (!session?.user) setAiConsentAt(undefined);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Native build only: there is no middleware in the static bundle, so the
  // login wall lives here. The web keeps its server-side redirect untouched.
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!isNativeBuild || loading || user) return;
    if (pathname.startsWith("/login") || pathname.startsWith("/marketing")) return;
    const next = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    router.replace(`/login${next}`);
  }, [loading, user, pathname, router]);

  const markAiConsent = useCallback((at?: string) => {
    setAiConsentAt(at ?? new Date().toISOString());
  }, []);

  return (
    <UserContext.Provider value={{ user, loading, aiConsentAt, markAiConsent }}>
      {children}
    </UserContext.Provider>
  );
}

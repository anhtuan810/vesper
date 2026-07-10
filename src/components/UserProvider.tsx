"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isAuthRetryableFetchError, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/lib/supabase";
import { bumpApiCacheGeneration, isNativeBuild } from "@/lib/api";
import { purgeClientCaches } from "@/lib/client-cache";
import { resetPortfolioRevision } from "@/lib/portfolio-revision";

interface UserContextValue {
  user: User | null;
  loading: boolean;
  // True from the moment a sign-out begins until the session is actually cleared.
  // supabase.auth.signOut() revokes server-side before it clears the local session
  // (and fires SIGNED_OUT), so `user` stays set during that round-trip — this flag
  // lets the app gate cover the screen immediately so the main surfaces don't linger.
  signingOut: boolean;
  // Raised synchronously by useSignOut before it awaits signOut().
  beginSignOut: () => void;
  // The one-time AI disclosure acknowledgment timestamp. `undefined` while it is
  // still being loaded (so the gate never flashes), `null` once loaded and not
  // yet acknowledged, or an ISO string once acknowledged.
  aiConsentAt: string | null | undefined;
  // Optimistically record the acknowledgment locally once the POST succeeds, so
  // the gate dismisses immediately without a refetch.
  markAiConsent: (at?: string) => void;
  // The gated-onboarding completion timestamp. `undefined` while loading (or when
  // the column doesn't exist yet, pre-migration), `null` once loaded and not yet
  // completed, or an ISO string once completed. Used to branch the empty-state
  // "add first asset" affordance: an already-onboarded user opens the in-app
  // collector; a not-yet-onboarded pass holder returns to /onboarding.
  onboardingCompletedAt: string | null | undefined;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  loading: true,
  signingOut: false,
  beginSignOut: () => {},
  aiConsentAt: undefined,
  markAiConsent: () => {},
  onboardingCompletedAt: undefined,
});

export function useUserContext(): UserContextValue {
  return useContext(UserContext);
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [aiConsentAt, setAiConsentAt] = useState<string | null | undefined>(undefined);
  const [onboardingCompletedAt, setOnboardingCompletedAt] = useState<string | null | undefined>(undefined);
  const beginSignOut = useCallback(() => setSigningOut(true), []);

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

    // Separate query on purpose: before the onboarding migration is applied the
    // column doesn't exist and this select errors — kept apart so it can never
    // break the ai_consent read above. A read error degrades to `undefined`
    // (unknown), not `null`, so we don't wrongly treat a user as un-onboarded.
    const loadOnboarding = (client: SupabaseClient, userId: string) => {
      client
        .from("users")
        .select("onboarding_completed_at")
        .eq("id", userId)
        .maybeSingle()
        .then(({ data, error }) =>
          setOnboardingCompletedAt(
            error
              ? undefined
              : (data as { onboarding_completed_at?: string | null } | null)?.onboarding_completed_at ?? null,
          ),
        );
    };

    // Initial resolution from the local session (fast, offline-friendly; no
    // purge on first load).
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null;
      setUser(user);
      setLoading(false);
      lastSeenUserId.current = user?.id ?? null;
      if (user) {
        loadConsent(supabase, user.id);
        loadOnboarding(supabase, user.id);
      }

      // Validate the local JWT against the server exactly once per load. The
      // session above comes from storage, so a stale token (e.g. the user was
      // deleted) would otherwise keep re-populating `user` via the
      // onAuthStateChange events below. If the server reports an explicit auth
      // failure, sign out to clear the session; ignore transient/network errors
      // (retryable fetch) so a blip never logs a valid user out.
      if (session) {
        supabase.auth.getUser().then(({ error }) => {
          if (error && !isAuthRetryableFetchError(error)) {
            supabase.auth.signOut();
          }
        });
      }
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
        // After the purge (which clears the volnar* namespace): new generation
        // so /api GETs miss the previous user's HTTP-cached responses.
        bumpApiCacheGeneration();
        resetPortfolioRevision();
        setAiConsentAt(undefined);
        setOnboardingCompletedAt(undefined);
      }

      lastSeenUserId.current = newId;
      setUser(session?.user ?? null);
      setLoading(false);
      // The transition has resolved: if this is the SIGNED_OUT that ends a
      // sign-out, the gate keeps covering via `!user` (and the redirect follows);
      // if it's a sign-in, we're no longer signing out. Either way, clear the flag.
      setSigningOut(false);

      // Only (re)load the acknowledgment flag on an actual switch — not on a
      // routine token refresh, which would needlessly refetch and could briefly
      // re-show the AI gate if it raced a just-submitted acknowledgment.
      if (switched && session?.user) {
        loadConsent(supabase, session.user.id);
        loadOnboarding(supabase, session.user.id);
      } else if (!session?.user) {
        setAiConsentAt(undefined);
        setOnboardingCompletedAt(undefined);
      }
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
    <UserContext.Provider value={{ user, loading, signingOut, beginSignOut, aiConsentAt, markAiConsent, onboardingCompletedAt }}>
      {children}
    </UserContext.Provider>
  );
}

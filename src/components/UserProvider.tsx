"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/lib/supabase";

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

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiConsentAt, setAiConsentAt] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
      if (user) {
        // Load the acknowledgment flag the AI disclosure gate keys off of.
        supabase
          .from("users")
          .select("ai_consent_at")
          .eq("id", user.id)
          .single()
          .then(({ data }) => setAiConsentAt(data?.ai_consent_at ?? null));
      }
    });
  }, []);

  const markAiConsent = useCallback((at?: string) => {
    setAiConsentAt(at ?? new Date().toISOString());
  }, []);

  return (
    <UserContext.Provider value={{ user, loading, aiConsentAt, markAiConsent }}>
      {children}
    </UserContext.Provider>
  );
}

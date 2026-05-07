"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, useProfile, useSignOut } from "@/lib/hooks";
import { NavBar } from "@/components/NavBar";
import { ProfileTab } from "@/components/ProfileTab";
import { createBrowserSupabase } from "@/lib/supabase";

const supabase = createBrowserSupabase();

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const profile = useProfile(user?.id);
  const signOut = useSignOut();
  const [mutationCount, setMutationCount] = useState(0);

  const fetchMutationCount = useCallback(async () => {
    if (!user?.id) return;
    const { count } = await supabase
      .from("mutations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    setMutationCount(count ?? 0);
  }, [user?.id]);

  useEffect(() => { fetchMutationCount(); }, [fetchMutationCount]);

  const setTab = (t: "portfolio" | "diary" | "profile") => {
    router.push(t === "portfolio" ? "/" : "/" + t);
  };

  if (userLoading) {
    return (
      <div className="min-h-screen bg-bg">
        <div className="h-14 bg-surface border-b border-border" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <NavBar
        tab="profile"
        setTab={setTab}
        mutationCount={mutationCount}
        liveCount={0}
        totalSymbols={0}
        lastUpdated={null}
        refreshing={false}
        refreshPrices={() => {}}
        avatarUrl={profile?.avatar_url}
        signOut={signOut}
      />
      <div className="max-w-[960px] mx-auto px-4 sm:px-8 pt-10 pb-24 md:pb-10">
        <ProfileTab profile={profile} mutationCount={mutationCount} />
      </div>
    </div>
  );
}

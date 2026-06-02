"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/hooks";
import { NavBar } from "@/components/NavBar";
import { ProfileContent } from "@/components/profile/ProfileContent";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import { useIsDesktop } from "@/lib/hooks/useIsDesktop";
import { createBrowserSupabase } from "@/lib/supabase";

const supabase = createBrowserSupabase();

export default function ProfilePage() {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const { user, loading: userLoading } = useUser();
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

  if (isDesktop === undefined || userLoading) {
    return (
      <div className="min-h-screen bg-bg" />
    );
  }

  if (isDesktop) {
    return (
      <DesktopShell tab="profile">
        <ProfileContent fillWidth />
      </DesktopShell>
    );
  }

  const setTab = (t: "portfolio" | "diary" | "profile" | "vitals") => {
    router.push(t === "portfolio" ? "/" : "/" + t);
  };

  return (
    <div className="min-h-screen bg-bg">
      <NavBar
        tab="profile"
        setTab={setTab}
        mutationCount={mutationCount}
        liveCount={0}
        totalSymbols={0}
        refreshing={false}
        refreshPrices={() => {}}
        empty
      />
      <ProfileContent />
    </div>
  );
}

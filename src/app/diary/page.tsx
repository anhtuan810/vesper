"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useUser, useAssets } from "@/lib/hooks";
import { NavBar } from "@/components/NavBar";
import { DiaryTab } from "@/components/DiaryTab";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Mutation } from "@/lib/supabase";

const supabase = createBrowserSupabase();

export default function DiaryPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const { assets } = useAssets(user?.id);
  const [mutations, setMutations] = useState<Mutation[]>([]);
  const [diaryFilter, setDiaryFilter] = useState("all");
  const [backfillDone, setBackfillDone] = useState(false);

  const fetchMutations = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("mutations")
      .select("*")
      .eq("user_id", user.id)
      .order("occurred_at", { ascending: false, nullsFirst: false });
    if (error) { console.error("Failed to load diary:", error.message); return; }
    setMutations(data || []);
  }, [user?.id]);

  useEffect(() => { fetchMutations(); }, [fetchMutations]);

  // Backfill zero-value assets once per session when diary is first opened
  useEffect(() => {
    if (!user?.id || backfillDone) return;
    setBackfillDone(true);
    fetch("/api/backfill", { method: "POST" }).then(async (res) => {
      const { updated } = await res.json();
      if (updated > 0) fetchMutations();
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const enrichedMutations = useMemo(() =>
    mutations.map(m => {
      if (m.asset_type && m.symbol) return m;
      const asset = assets.find(a => a.name.toLowerCase() === m.asset_name?.toLowerCase());
      if (!asset) return m;
      return {
        ...m,
        asset_type: m.asset_type ?? asset.type ?? null,
        symbol: m.symbol ?? asset.symbol ?? null,
      };
    }),
    [mutations, assets]
  );

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
        tab="diary"
        setTab={setTab}
        mutationCount={mutations.length}
        liveCount={0}
        totalSymbols={0}
        refreshing={false}
        refreshPrices={() => {}}
      />
      <div className="max-w-[960px] mx-auto px-4 sm:px-8 pt-10 pb-24 md:pb-10">
        <DiaryTab
          mutations={enrichedMutations}
          diaryFilter={diaryFilter}
          setDiaryFilter={setDiaryFilter}
        />
      </div>
    </div>
  );
}

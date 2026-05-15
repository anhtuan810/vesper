"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser, useAssets } from "@/lib/hooks";
import { NavBar } from "@/components/NavBar";
import { DiaryTab } from "@/components/DiaryTab";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Mutation } from "@/lib/supabase";
import { DIARY_PAGE_SIZE } from "@/lib/constants";

const supabase = createBrowserSupabase();

export default function DiaryPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const { assets } = useAssets(user?.id);
  const [mutations, setMutations] = useState<Mutation[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [backfillDone, setBackfillDone] = useState(false);
  const loadedRef = useRef(0);

  const fetchMutations = useCallback(async () => {
    if (!user?.id) return;
    const { data, count, error } = await supabase
      .from("mutations")
      .select("*, asset:assets!asset_id (name)", { count: "exact" })
      .eq("user_id", user.id)
      .order("recorded_at", { ascending: false })
      .range(0, DIARY_PAGE_SIZE - 1);
    if (error) { console.error("Failed to load diary:", error.message); return; }
    const loaded = data?.length ?? 0;
    const total = count ?? 0;
    setMutations(data || []);
    setTotalCount(total);
    setHasMore(total > loaded);
    loadedRef.current = loaded;
  }, [user?.id]);

  const loadMore = useCallback(async () => {
    if (!user?.id) return;
    const offset = loadedRef.current;
    const { data, error } = await supabase
      .from("mutations")
      .select("*, asset:assets!asset_id (name)")
      .eq("user_id", user.id)
      .order("recorded_at", { ascending: false })
      .range(offset, offset + DIARY_PAGE_SIZE - 1);
    if (error) return;
    const newData = data || [];
    setMutations((prev) => [...prev, ...newData]);
    loadedRef.current = offset + newData.length;
    setHasMore(loadedRef.current < totalCount);
  }, [user?.id, totalCount]);

  useEffect(() => { fetchMutations(); }, [fetchMutations]);

  // Backfill zero-value assets once per session when diary is first opened
  useEffect(() => {
    if (!user?.id || backfillDone) return;
    setBackfillDone(true);
    fetch("/api/backfill", { method: "POST" }).then(async (res) => {
      const { updated } = await res.json();
      if (updated > 0) fetchMutations();
    }).catch((err) => { console.error("Backfill fetch failed:", err); });
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
        mutationCount={totalCount}
        liveCount={0}
        totalSymbols={0}
        refreshing={false}
        refreshPrices={() => {}}
      />
      <div className="max-w-[960px] mx-auto px-4 sm:px-8 pt-4 pb-24 md:pb-10">
        <DiaryTab
          mutations={enrichedMutations}
          hasMore={hasMore}
          onLoadMore={loadMore}
        />
      </div>
    </div>
  );
}

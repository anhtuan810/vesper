"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser, useAssets, usePortfolioRevision } from "@/lib/hooks";
import { NavBar } from "@/components/NavBar";
import { DiaryTab } from "@/components/DiaryTab";
import { useIsDesktop } from "@/lib/hooks/useIsDesktop";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Mutation } from "@/lib/supabase";
import { DIARY_PAGE_SIZE, diaryCacheKey } from "@/lib/constants";

const supabase = createBrowserSupabase();

// First-page SWR cache (sessionStorage), mirroring the assets/vitals pattern: a
// revisit paints instantly from this, then revalidates in the background. Only the
// first page is cached; pagination beyond it stays live. All storage/JSON access
// is wrapped so a failure is a silent no-op.
type DiaryCache = { mutations: Mutation[]; totalCount: number };

function readDiaryCache(userId: string): DiaryCache | null {
  try {
    const raw = sessionStorage.getItem(diaryCacheKey(userId));
    return raw ? (JSON.parse(raw) as DiaryCache) : null;
  } catch { return null; }
}

function writeDiaryCache(userId: string, cache: DiaryCache): void {
  try { sessionStorage.setItem(diaryCacheKey(userId), JSON.stringify(cache)); } catch {}
}

function clearDiaryCache(userId: string): void {
  try { sessionStorage.removeItem(diaryCacheKey(userId)); } catch {}
}

export default function DiaryPage() {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const { user, loading: userLoading } = useUser();
  const userId = user?.id;
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
    const rows = data || [];
    setMutations(rows);
    setTotalCount(total);
    setHasMore(total > loaded);
    loadedRef.current = loaded;
    writeDiaryCache(user.id, { mutations: rows, totalCount: total });
  }, [user?.id]);

  // Clear the first-page cache and refetch — used by the revision bump and the
  // backfill "rows changed" path so a stale cache never lingers if the refetch
  // were to fail.
  const reloadFirstPage = useCallback(() => {
    if (userId) clearDiaryCache(userId);
    fetchMutations();
  }, [userId, fetchMutations]);

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

  // Instant paint on revisit: hydrate the first page from sessionStorage as soon
  // as the user is known, before the background revalidate (the mount fetch below)
  // lands. A true first-ever load (no cache) falls through to the empty state,
  // then the fetched list.
  const hydratedRef = useRef(false);
  const hydrateFromCache = useCallback(() => {
    if (!userId || hydratedRef.current) return;
    hydratedRef.current = true;
    const cached = readDiaryCache(userId);
    if (!cached) return;
    setMutations(cached.mutations);
    setTotalCount(cached.totalCount);
    setHasMore(cached.totalCount > cached.mutations.length);
    loadedRef.current = cached.mutations.length;
  }, [userId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { hydrateFromCache(); }, [hydrateFromCache]);

  useEffect(() => { fetchMutations(); }, [fetchMutations]);

  // Refetch the diary when a mutation bumps the revision, and when the tab
  // regains focus — so a chat save elsewhere shows up without a manual refresh.
  const revision = usePortfolioRevision();
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (revision > 0) reloadFirstPage(); }, [revision, reloadFirstPage]);

  useEffect(() => {
    if (!user?.id) return;
    const onFocus = () => {
      if (document.visibilityState === "visible") fetchMutations();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [user?.id, fetchMutations]);

  // Backfill zero-value assets once per session when diary is first opened
  useEffect(() => {
    if (!user?.id || backfillDone) return;
    setBackfillDone(true);
    fetch("/api/backfill", { method: "POST" }).then(async (res) => {
      const { updated } = await res.json();
      if (updated > 0) reloadFirstPage();
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

  const setTab = (t: "portfolio" | "diary" | "profile" | "vitals") => {
    router.push(t === "portfolio" ? "/" : "/" + t);
  };

  if (isDesktop === undefined) {
    return <div className="min-h-screen bg-bg" />;
  }

  if (userLoading) {
    return (
      <div className="min-h-screen bg-bg">
        <div className="h-9 md:h-14 bg-surface border-b border-border" />
      </div>
    );
  }

  // Desktop: the (main) layout provides the shell; supply center content only.
  if (isDesktop) {
    return (
      <DiaryTab
        mutations={enrichedMutations}
        hasMore={hasMore}
        onLoadMore={loadMore}
      />
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
        hideRefresh
      />
      <div className="max-w-[960px] mx-auto px-0 md:px-8 pt-4 pb-24 md:pb-10">
        <DiaryTab
          mutations={enrichedMutations}
          hasMore={hasMore}
          onLoadMore={loadMore}
        />
      </div>
    </div>
  );
}

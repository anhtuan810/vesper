"use client";

import { useState, useEffect } from "react";
import type { DiaryMarketMove } from "@/lib/diary-market-moves";
import { apiFetch } from "@/lib/api";
import { usePortfolioRevision } from "@/lib/portfolio-revision";

// Module-level cache so navigating between tabs doesn't refetch. It carries the
// portfolio revision it was fetched at: a later add/edit/remove bumps the shared
// revision (see portfolio-revision.ts), and the swings are regenerated
// server-side after every such change — so the cache is only reused while it is
// at least as fresh as the current revision, and a bump forces a refetch. Before
// this, the cache was seeded once and never invalidated: a user who opened the
// app empty (moves = []) then added assets kept seeing NO market entries for the
// whole session, because this hook — unlike useAssets / vitals / snapshots —
// never listened to the revision.
let _cache: { moves: DiaryMarketMove[]; revision: number } | null = null;

export function useDiaryMarketMoves() {
  const revision = usePortfolioRevision();
  // Seed from the module cache; a stale cache (older revision) is still shown
  // while the refetch below runs, so entries never flash empty on a change.
  const [moves, setMoves] = useState<DiaryMarketMove[]>(() => _cache?.moves ?? []);
  const [loading, setLoading] = useState(() => !_cache);

  useEffect(() => {
    // Cache is at least as fresh as the current revision → nothing to fetch;
    // local state already reflects it (seeded on mount).
    if (_cache && _cache.revision >= revision) return;

    let cancelled = false;
    // On a revision-triggered refetch, bust the endpoint's 5-min HTTP cache by
    // varying the URL per revision — otherwise the browser would replay the
    // pre-add (empty) body and the fix would be invisible. The initial load
    // (revision 0) uses the plain, cacheable URL.
    const url = revision > 0 ? `/api/diary/market-moves?_r=${revision}` : "/api/diary/market-moves";
    apiFetch(url)
      .then((r) => r.json())
      .then(({ moves: m }: { moves: DiaryMarketMove[] }) => {
        if (cancelled) return;
        const list = Array.isArray(m) ? m : [];
        _cache = { moves: list, revision };
        setMoves(list);
      })
      .catch(() => {
        if (!cancelled) setMoves([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [revision]);

  return { moves, loading };
}

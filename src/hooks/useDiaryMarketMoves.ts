"use client";

import { useState, useEffect } from "react";
import type { DiaryMarketMove } from "@/lib/diary-market-moves";

let _cache: { moves: DiaryMarketMove[]; fetchedAt: number } | null = null;

export function useDiaryMarketMoves() {
  const [moves, setMoves] = useState<DiaryMarketMove[]>(() => _cache?.moves ?? []);
  const [loading, setLoading] = useState(() => !_cache);

  useEffect(() => {
    if (_cache) return;

    fetch("/api/diary/market-moves")
      .then((r) => r.json())
      .then(({ moves: m }: { moves: DiaryMarketMove[] }) => {
        const list = Array.isArray(m) ? m : [];
        _cache = { moves: list, fetchedAt: Date.now() };
        setMoves(list);
      })
      .catch(() => setMoves([]))
      .finally(() => setLoading(false));
  }, []);

  return { moves, loading };
}

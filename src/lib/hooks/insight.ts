"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { MarketHighlight } from "@/lib/market-highlights";
import type { InsightCard } from "@/lib/portfolio-insights";
import { INSIGHT_CACHE_TTL_MS } from "@/lib/constants";
import { usePortfolioRevision } from "@/lib/portfolio-revision";
import { useUser } from "./user";

// Tagged with the userId it belongs to, so the "Worth knowing" band of one
// account can never be served against another account's session after an
// in-session switch.
let _insightCache: { userId: string | undefined; detail: string | null; insights: InsightCard[]; market: MarketHighlight[]; fetchedAt: number } | null = null;

export function primeInsightCache(userId: string | undefined, detail: string | null, insights: InsightCard[] = [], market: MarketHighlight[] = []) {
  _insightCache = { userId, detail, insights, market, fetchedAt: Date.now() };
}

export function invalidateInsightCache() {
  _insightCache = null;
  fetch("/api/insight", { method: "DELETE" }).catch(() => {});
}

export function useInsight() {
  const revision = usePortfolioRevision();
  const { user } = useUser();
  const userId = user?.id;
  const [detail, setDetail] = useState<string | null>(null);
  const [insights, setInsights] = useState<InsightCard[]>([]);
  const [market, setMarket] = useState<MarketHighlight[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback((force: boolean) => {
    if (
      !force &&
      _insightCache &&
      _insightCache.userId === userId &&
      Date.now() - _insightCache.fetchedAt < INSIGHT_CACHE_TTL_MS
    ) {
      setDetail(_insightCache.detail);
      setInsights(_insightCache.insights);
      setMarket(_insightCache.market);
      setLoading(false);
      return;
    }

    // A forced read (after a portfolio mutation) regenerates the portfolio cards
    // from current assets server-side (fresh=1) and bypasses BOTH the client cache
    // (force) and any HTTP/edge cache (no-store + a unique query param), so a
    // removed or changed top position can never linger in the band.
    const url = force ? `/api/insight?fresh=1&rev=${Date.now()}` : "/api/insight";
    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then(({ insight, insights: ins, market: m }: { insight: { detail: string | null }; insights: InsightCard[]; market: MarketHighlight[] }) => {
        const d = insight?.detail ?? null;
        const list = Array.isArray(ins) ? ins : [];
        const mk = Array.isArray(m) ? m : [];
        _insightCache = { userId, detail: d, insights: list, market: mk, fetchedAt: Date.now() };
        setDetail(d);
        setInsights(list);
        setMarket(mk);
      })
      .catch(() => { setDetail(null); setInsights([]); setMarket([]); })
      .finally(() => setLoading(false));
  }, [userId]);

  // Initial mount respects the cache; every later revision bump forces a refresh,
  // the same way the holdings list and Vitals refetch on a portfolio change.
  const mounted = useRef(false);
  useEffect(() => {
    const force = mounted.current;
    mounted.current = true;
    load(force);
  }, [revision, load]);

  return { detail, market, insights, loading };
}

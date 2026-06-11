"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { MarketHighlight } from "@/lib/market-highlights";
import { INSIGHT_CACHE_TTL_MS } from "@/lib/constants";
import { usePortfolioRevision } from "@/lib/portfolio-revision";

let _insightCache: { detail: string | null; portfolio: string[]; market: MarketHighlight[]; fetchedAt: number } | null = null;

export function primeInsightCache(detail: string | null, portfolio: string[] = [], market: MarketHighlight[] = []) {
  _insightCache = { detail, portfolio, market, fetchedAt: Date.now() };
}

export function invalidateInsightCache() {
  _insightCache = null;
  fetch("/api/insight", { method: "DELETE" }).catch(() => {});
}

export function useInsight() {
  const revision = usePortfolioRevision();
  const [detail, setDetail] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<string[]>([]);
  const [market, setMarket] = useState<MarketHighlight[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback((force: boolean) => {
    if (!force && _insightCache && Date.now() - _insightCache.fetchedAt < INSIGHT_CACHE_TTL_MS) {
      setDetail(_insightCache.detail);
      setPortfolio(_insightCache.portfolio);
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
      .then(({ insight, portfolio: p, market: m }: { insight: { detail: string | null }; portfolio: string[]; market: MarketHighlight[] }) => {
        const d = insight?.detail ?? null;
        const pt = Array.isArray(p) ? p : [];
        const mk = Array.isArray(m) ? m : [];
        _insightCache = { detail: d, portfolio: pt, market: mk, fetchedAt: Date.now() };
        setDetail(d);
        setPortfolio(pt);
        setMarket(mk);
      })
      .catch(() => { setDetail(null); setPortfolio([]); setMarket([]); })
      .finally(() => setLoading(false));
  }, []);

  // Initial mount respects the cache; every later revision bump forces a refresh,
  // the same way the holdings list and Vitals refetch on a portfolio change.
  const mounted = useRef(false);
  useEffect(() => {
    const force = mounted.current;
    mounted.current = true;
    load(force);
  }, [revision, load]);

  // Up to 3 ordered "worth knowing" sentences for the carousel: portfolio cards
  // when present, else the single legacy insight as a one-item list.
  const insights = portfolio.length > 0 ? portfolio.slice(0, 3) : (detail ? [detail] : []);

  return { detail, portfolio, market, insights, loading };
}

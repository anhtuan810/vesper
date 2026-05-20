"use client";

import { useState, useEffect } from "react";
import type { MarketHighlight } from "@/lib/market-highlights";
import { INSIGHT_CACHE_TTL_MS } from "@/lib/constants";

let _insightCache: { detail: string | null; portfolio: string[]; market: MarketHighlight[]; fetchedAt: number } | null = null;

export function primeInsightCache(detail: string | null, portfolio: string[] = [], market: MarketHighlight[] = []) {
  _insightCache = { detail, portfolio, market, fetchedAt: Date.now() };
}

export function invalidateInsightCache() {
  _insightCache = null;
  fetch("/api/insight", { method: "DELETE" }).catch(() => {});
}

export function useInsight() {
  const [detail, setDetail] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<string[]>([]);
  const [market, setMarket] = useState<MarketHighlight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (_insightCache && Date.now() - _insightCache.fetchedAt < INSIGHT_CACHE_TTL_MS) {
      setDetail(_insightCache.detail);
      setPortfolio(_insightCache.portfolio);
      setMarket(_insightCache.market);
      setLoading(false);
      return;
    }

    fetch("/api/insight", { cache: "no-store" })
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

  return { detail, portfolio, market, loading };
}

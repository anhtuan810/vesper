"use client";

import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";
import { useUser, useAssets, useDisplayCurrencyState, primeInsightCache, usePortfolioRevision } from "@/lib/hooks";
import ChatPopup from "@/components/ChatPopup";
import { NavBar } from "@/components/NavBar";
import { PortfolioTab } from "@/components/PortfolioTab";
import { PortfolioEmptyState } from "@/components/PortfolioEmptyState";
import { useIsDesktop } from "@/lib/hooks/useIsDesktop";
import { useState, useEffect, useCallback, useMemo } from "react";
import { computeCurrentBalance } from "@/lib/mortgage";
import { toUsdClient, toDisplay } from "@/lib/money";
import type { LiveAsset, Mutation } from "@/lib/supabase";
import type { SnapshotPoint } from "@/components/NetWorthChart";
import type { MarketHighlight } from "@/lib/market-highlights";
import type { InsightCard } from "@/lib/portfolio-insights";


export default function Dashboard() {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const { user, loading: userLoading } = useUser();
  const {
    assets, loading: assetsLoading, error: assetsError, refreshing,
    refreshPrices, refetchAssets, lastUpdated, priceHealth, pricesLoaded,
  } = useAssets(user?.id);
  const { currency: displayCurrency, loaded: currencyLoaded } = useDisplayCurrencyState();
  const valuesSettled = pricesLoaded && currencyLoaded;
  const [chatOpen, setChatOpen] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const [mutations, setMutations] = useState<Mutation[]>([]);
  const [initialSnapshots, setInitialSnapshots] = useState<SnapshotPoint[] | undefined>();
  const [marketHighlights, setMarketHighlights] = useState<MarketHighlight[]>([]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("welcome")) {
      window.history.replaceState({}, "", "/");
      track("signup");
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const createdAt = new Date(user.created_at).getTime();
    if (Date.now() - createdAt > 24 * 60 * 60 * 1000) {
      track("return_visit_day2_plus");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchDashboardInit = useCallback(async () => {
    if (!user?.id) return;
    const res = await fetch("/api/dashboard-init");
    if (!res.ok) return;
    const { insight, insights, market, marketHighlights, snapshots, mutations } = await res.json();
    // Chart + diary badge come from dashboard-init's fast, deterministic data —
    // paint them immediately, never behind the insight Haiku.
    setInitialSnapshots(snapshots ?? []);
    setMutations(mutations ?? []);
    setMarketHighlights(marketHighlights ?? []);

    const cards: InsightCard[] = insights ?? [];
    if (insight != null || cards.length > 0) {
      // Insight cache HIT: dashboard-init already carries the band's content (the
      // cached legacy insight and/or the deterministic portfolio cards). Prime the
      // band exactly as before — one round-trip, no extra fetch.
      primeInsightCache(insight, cards, market ?? []);
    }
    // Insight cache MISS (no cards, no cached insight): dashboard-init returned
    // without paying the Haiku cost, so we deliberately leave the insight cache
    // cold. The band's own useInsight then fetches /api/insight on its separate,
    // non-blocking channel — rendering its placeholder while in flight and
    // swapping in the generated insight when it lands. Priming a null here would
    // poison that cache and the band would never fill. A failed fetch is swallowed
    // by useInsight (band falls back to its empty state).
  }, [user?.id]);

  const refreshMutations = useCallback(async () => {
    if (!user?.id) return;
    const res = await fetch("/api/mutations");
    if (!res.ok) return;
    const { mutations } = await res.json();
    setMutations(mutations ?? []);
  }, [user?.id]);

  useEffect(() => { fetchDashboardInit(); }, [fetchDashboardInit]);

  // Refresh the net-worth chart's snapshots without re-priming the insight cache
  // (the "Worth knowing" band is an intentional 24h cache, not per-mutation).
  const refreshSnapshots = useCallback(async () => {
    if (!user?.id) return;
    const res = await fetch("/api/snapshots?range=1M", { cache: "no-store" });
    if (!res.ok) return;
    const { data } = await res.json();
    setInitialSnapshots(data ?? []);
  }, [user?.id]);

  useEffect(() => {
    const handler = () => {
      refetchAssets();
      refreshMutations();
    };
    window.addEventListener("volnar:asset-restored", handler);
    return () => window.removeEventListener("volnar:asset-restored", handler);
  }, [refetchAssets, refreshMutations]);

  // A mutation (chat save / undo) bumps the revision: refresh the diary badge and
  // the chart. Holdings + net worth come from useAssets, which refetches itself.
  const revision = usePortfolioRevision();
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (revision > 0) { refreshMutations(); refreshSnapshots(); } }, [revision, refreshMutations, refreshSnapshots]);

  // Refresh the badge + chart when the tab regains focus.
  useEffect(() => {
    if (!user?.id) return;
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        refreshMutations();
        refreshSnapshots();
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [user?.id, refreshMutations, refreshSnapshots]);

  const setTab = (t: "portfolio" | "diary" | "profile" | "vitals") => {
    if (t !== "portfolio") router.push("/" + t);
  };

  const {
    netTotal, grossTotal, liveCount, totalSymbols,
  } = useMemo(() => {
    // Sum each asset's NATIVE equity, converting directly to the display
    // currency (identity for home-currency assets — no FX, no drift).
    const netTotal = assets.reduce((sum, a) => {
      const cur = a.currency || "USD";
      const native = a.type === "real_estate"
        ? Math.max(0, a.value - computeCurrentBalance(a))
        : a.value;
      const inDisplay = toDisplay(native, cur, displayCurrency);
      return inDisplay != null ? sum + inDisplay : sum;
    }, 0);
    const grossTotal = assets.reduce((sum, a) => sum + toUsdClient(a.value, a.currency || "USD"), 0);
    const liveCount = assets.filter((a) => a.livePrice).length;
    const totalSymbols = assets.filter((a) => a.symbol).length;
    return { netTotal, grossTotal, liveCount, totalSymbols };
  }, [assets, displayCurrency]);

  // Client-only desktop detection: render a neutral background until known to
  // avoid a hydration mismatch and a layout flash.
  if (isDesktop === undefined) {
    return <div className="min-h-screen bg-bg" />;
  }

  if (userLoading || assetsLoading) {
    return (
      <div className="min-h-screen bg-bg">
        <div className="h-9 md:h-14 bg-surface border-b border-border" />
        <div className="max-w-2xl mx-auto px-4 pt-6 space-y-3">
          <div className="bg-surface rounded-2xl border border-border p-8 animate-pulse">
            <div className="flex gap-8">
              <div className="w-28 h-28 rounded-full bg-surface-elev shrink-0" />
              <div className="flex-1 space-y-3 pt-1">
                <div className="h-2.5 w-16 bg-surface-elev rounded-full" />
                <div className="h-10 w-40 bg-surface-elev rounded-lg" />
                <div className="space-y-2 pt-2">
                  <div className="h-2 bg-surface-elev rounded-full" />
                  <div className="h-2 w-4/5 bg-surface-elev rounded-full" />
                  <div className="h-2 w-3/5 bg-surface-elev rounded-full" />
                </div>
              </div>
            </div>
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-surface rounded-2xl border border-border p-5 animate-pulse flex justify-between items-center">
              <div className="space-y-2">
                <div className="h-2.5 w-24 bg-surface-elev rounded-full" />
                <div className="h-4 w-16 bg-surface-elev rounded-full" />
              </div>
              <div className="h-3 w-12 bg-surface-elev rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (assetsError) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm text-dim mb-2">Failed to load your portfolio.</div>
          <button
            onClick={() => window.location.reload()}
            className="font-mono text-accent hover:underline"
            style={{ fontSize: 12 }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  const isEmpty = assets.length === 0;

  // Desktop web: the (main) layout provides the persistent three-column shell
  // (Vitals rail + chat rail); this route only supplies the center content.
  if (isDesktop) {
    return isEmpty ? (
      <PortfolioEmptyState />
    ) : (
      <PortfolioTab
        assets={assets as LiveAsset[]}
        grossTotal={grossTotal}
        netTotal={netTotal}
        initialSnapshots={initialSnapshots}
        valuesSettled={valuesSettled}
        mutations={mutations}
        marketHighlights={marketHighlights}
      />
    );
  }

  return (
    <div
      className="min-h-screen bg-bg"
      style={isEmpty ? {
        backgroundImage:
          "radial-gradient(ellipse 80% 50% at 20% 0%, rgba(212,165,116,0.05), transparent 50%), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(107,170,117,0.03), transparent 50%)",
      } : undefined}
    >
      <NavBar
        tab="portfolio"
        setTab={setTab}
        mutationCount={mutations.length}
        liveCount={liveCount}
        totalSymbols={totalSymbols}
        refreshing={refreshing}
        refreshPrices={refreshPrices}
        lastUpdated={lastUpdated}
        empty={isEmpty}
      />

      <div className={`max-w-[960px] mx-auto pb-36 ${isEmpty ? "" : "px-4 md:px-8 pt-4"}`}>
        {priceHealth === "degraded" && (
          <div
            className="rounded-xl px-5 py-3 mb-4 flex items-center justify-between"
            style={{
              background: "var(--negative-soft)",
              border: "1px solid var(--border)",
            }}
          >
            <span
              className="leading-relaxed"
              style={{ fontSize: 12, color: "var(--negative)" }}
            >
              Live prices unavailable. Showing last known values.
            </span>
            <button
              onClick={refreshPrices}
              disabled={refreshing}
              className="font-mono uppercase shrink-0 ml-3"
              style={{
                fontSize: 10,
                color: "var(--negative)",
                letterSpacing: "0.1em",
                background: "none",
                border: "none",
                cursor: refreshing ? "default" : "pointer",
                opacity: refreshing ? 0.5 : 1,
              }}
            >
              Retry
            </button>
          </div>
        )}
        {isEmpty ? (
          <PortfolioEmptyState />
        ) : (
          <PortfolioTab
            assets={assets as LiveAsset[]}
            grossTotal={grossTotal}
            netTotal={netTotal}
            initialSnapshots={initialSnapshots}
            valuesSettled={valuesSettled}
            mutations={mutations}
            marketHighlights={marketHighlights}
          />
        )}
      </div>

      {/* ChatPopup is desktop-only; mobile users access chat via /chat route */}
      <div className="hidden md:block">
        <ChatPopup
          userId={user?.id}
          isOpen={chatOpen}
          hasNew={hasNew}
          onToggle={() => setChatOpen(!chatOpen)}
          onPortfolioUpdate={() => {
            refetchAssets();
            refreshMutations();
            if (!chatOpen) setHasNew(true);
          }}
          onNewMessage={() => {
            if (!chatOpen) setHasNew(true);
          }}
          onOpen={() => setHasNew(false)}
        />
      </div>
    </div>
  );
}

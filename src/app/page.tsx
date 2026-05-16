"use client";

import { useRouter } from "next/navigation";
import { useUser, useAssets, useDisplayCurrency, primeInsightCache } from "@/lib/hooks";
import ChatPopup from "@/components/ChatPopup";
import { NavBar } from "@/components/NavBar";
import { PortfolioTab } from "@/components/PortfolioTab";
import { useState, useEffect, useCallback, useMemo } from "react";
import { computeCurrentBalance } from "@/lib/mortgage";
import { formatMoney, toUsdClient } from "@/lib/money";
import type { LiveAsset, Mutation } from "@/lib/supabase";
import type { SnapshotPoint } from "@/components/NetWorthChart";

export default function Dashboard() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const {
    assets, loading: assetsLoading, error: assetsError, refreshing,
    refreshPrices, refetchAssets, lastUpdated, priceHealth,
  } = useAssets(user?.id);
  const displayCurrency = useDisplayCurrency();
  const [chatOpen, setChatOpen] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const [mutations, setMutations] = useState<Mutation[]>([]);
  const [initialSnapshots, setInitialSnapshots] = useState<SnapshotPoint[] | undefined>();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("welcome")) {
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const fetchDashboardInit = useCallback(async () => {
    if (!user?.id) return;
    const res = await fetch("/api/dashboard-init");
    if (!res.ok) return;
    const { insight, snapshots, mutations } = await res.json();
    primeInsightCache(insight);
    setInitialSnapshots(snapshots ?? []);
    setMutations(mutations ?? []);
  }, [user?.id]);

  const refreshMutations = useCallback(async () => {
    if (!user?.id) return;
    const res = await fetch("/api/dashboard-init");
    if (!res.ok) return;
    const { mutations } = await res.json();
    setMutations(mutations ?? []);
  }, [user?.id]);

  useEffect(() => { fetchDashboardInit(); }, [fetchDashboardInit]);

  useEffect(() => {
    const handler = () => {
      refetchAssets();
      refreshMutations();
    };
    window.addEventListener("volnar:asset-restored", handler);
    return () => window.removeEventListener("volnar:asset-restored", handler);
  }, [refetchAssets, refreshMutations]);

  const setTab = (t: "portfolio" | "diary" | "profile") => {
    if (t !== "portfolio") router.push("/" + t);
  };

  const {
    netTotal, grossTotal, liveCount, totalSymbols,
  } = useMemo(() => {
    const netTotal = assets.reduce((sum, a) => {
      const cur = a.currency || "USD";
      const valueUsd = toUsdClient(a.value, cur);
      const mortUsd = a.type === "real_estate" ? toUsdClient(computeCurrentBalance(a), cur) : 0;
      return sum + valueUsd - mortUsd;
    }, 0);
    const grossTotal = assets.reduce((sum, a) => sum + toUsdClient(a.value, a.currency || "USD"), 0);
    const liveCount = assets.filter((a) => a.livePrice).length;
    const totalSymbols = assets.filter((a) => a.symbol).length;
    return { netTotal, grossTotal, liveCount, totalSymbols };
  }, [assets]);

  if (userLoading || assetsLoading) {
    return (
      <div className="min-h-screen bg-bg">
        <div className="h-14 bg-surface border-b border-border" />
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

  return (
    <div className="min-h-screen bg-bg">
      <NavBar
        tab="portfolio"
        setTab={setTab}
        mutationCount={mutations.length}
        liveCount={liveCount}
        totalSymbols={totalSymbols}
        refreshing={refreshing}
        refreshPrices={refreshPrices}
        lastUpdated={lastUpdated}
      />

      <div className="max-w-[960px] mx-auto px-4 sm:px-8 pt-4 pb-36">
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
        {assets.length === 0 ? (
          <div className="flex flex-col items-center pt-24 text-center">
            <div
              className="flex items-center justify-center mb-6 font-serif text-accent"
              style={{
                width: 56, height: 56, borderRadius: 14,
                background: "var(--accent-soft)",
                border: "1px solid var(--border)",
                fontSize: 22, fontVariationSettings: "'opsz' 144",
              }}
            >
              V
            </div>
            <div
              className="font-serif font-light text-fg leading-none mb-3"
              style={{ fontSize: 48, letterSpacing: "-0.035em", fontVariationSettings: "'opsz' 144" }}
            >
              {formatMoney(0, "USD", displayCurrency)}
            </div>
            <div className="text-sm text-dim mb-2">No positions yet</div>
            <p className="text-faint text-xs max-w-xs leading-relaxed mb-8">
              Tell the assistant what you own — stocks, real estate, cash — and it will build your portfolio automatically.
            </p>
            <button
              onClick={() => router.push('/chat')}
              className="font-mono text-bg bg-accent hover:opacity-90 transition-opacity"
              style={{ fontSize: 12, padding: "10px 20px", borderRadius: 12, letterSpacing: "0.06em" }}
            >
              Add your first asset →
            </button>
          </div>
        ) : (
          <PortfolioTab
            assets={assets as LiveAsset[]}
            grossTotal={grossTotal}
            netTotal={netTotal}
            initialSnapshots={initialSnapshots}
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

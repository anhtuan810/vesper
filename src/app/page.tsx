"use client";

import { useRouter } from "next/navigation";
import { useUser, useAssets, useProfile, useSignOut } from "@/lib/hooks";
import ChatPopup from "@/components/ChatPopup";
import { NavBar } from "@/components/NavBar";
import { PortfolioTab } from "@/components/PortfolioTab";
import { useState, useEffect, useCallback, useMemo } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import { getWarnings, type DashboardMutation } from "@/lib/utils";
import type { LiveAsset } from "@/lib/supabase";

const supabase = createBrowserSupabase();

export default function Dashboard() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const profile = useProfile(user?.id);
  const {
    assets, loading: assetsLoading, error: assetsError, refreshing, lastUpdated,
    refreshPrices, refetchAssets,
  } = useAssets(user?.id);
  const signOut = useSignOut();
  const [chatOpen, setChatOpen] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const [mutations, setMutations] = useState<DashboardMutation[]>([]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("welcome")) {
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const enrichedMutations = useMemo(() =>
    mutations.map(m => {
      if (m.asset_type || m.symbol) return m;
      const asset = assets.find(a => a.name.toLowerCase() === m.asset_name?.toLowerCase());
      return { ...m, asset_type: asset?.type ?? null, symbol: asset?.symbol ?? null };
    }),
    [mutations, assets]
  );

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

  const setTab = (t: "portfolio" | "diary" | "profile") => {
    if (t !== "portfolio") router.push("/" + t);
  };

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

  const netTotal = assets.reduce((sum, a) => {
    const net = a.type === "real_estate" && a.mortgage_balance
      ? a.value - a.mortgage_balance : a.value;
    return sum + net;
  }, 0);
  const grossTotal = assets.reduce((sum, a) => sum + a.value, 0);
  const byType = assets.reduce((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + a.value;
    return acc;
  }, {} as Record<string, number>);
  const sorted = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  const liveCount = assets.filter((a) => a.livePrice).length;
  const totalSymbols = assets.filter((a) => a.symbol).length;
  const totalDebt = assets.reduce((sum, a) => sum + (a.mortgage_balance || 0), 0);
  const topAsset = [...assets].sort((a, b) => b.value - a.value)[0];
  const warnings = assets.length > 0 ? getWarnings(assets, byType, grossTotal) : [];

  return (
    <div className="min-h-screen bg-bg">
      <NavBar
        tab="portfolio"
        setTab={setTab}
        mutationCount={mutations.length}
        liveCount={liveCount}
        totalSymbols={totalSymbols}
        lastUpdated={lastUpdated}
        refreshing={refreshing}
        refreshPrices={refreshPrices}
        avatarUrl={profile?.avatar_url}
        signOut={signOut}
      />

      <div className="max-w-[960px] mx-auto px-4 sm:px-8 pt-10 pb-36">
        {assets.length === 0 ? (
          <div className="flex flex-col items-center pt-24 text-center">
            <div
              className="flex items-center justify-center mb-6 font-serif text-accent"
              style={{
                width: 56, height: 56, borderRadius: 14,
                background: "var(--accent-soft)",
                border: "1px solid rgba(212,165,116,0.18)",
                fontSize: 22, fontVariationSettings: "'opsz' 144",
              }}
            >
              V
            </div>
            <div
              className="font-serif font-light text-fg leading-none mb-3"
              style={{ fontSize: 48, letterSpacing: "-0.035em", fontVariationSettings: "'opsz' 144" }}
            >
              €0
            </div>
            <div className="text-sm text-dim mb-2">No positions yet</div>
            <p className="text-faint text-xs max-w-xs leading-relaxed mb-8">
              Tell the assistant what you own — stocks, real estate, cash — and it will build your portfolio automatically.
            </p>
            <button
              onClick={() => setChatOpen(true)}
              className="font-mono text-bg bg-accent hover:opacity-90 transition-opacity"
              style={{ fontSize: 12, padding: "10px 20px", borderRadius: 12, letterSpacing: "0.06em" }}
            >
              Add your first asset →
            </button>
          </div>
        ) : (
          <PortfolioTab
            assets={assets as LiveAsset[]}
            sorted={sorted}
            byType={byType}
            grossTotal={grossTotal}
            netTotal={netTotal}
            totalDebt={totalDebt}
            topAsset={topAsset as LiveAsset}
            warnings={warnings}
            mutations={enrichedMutations}
            onViewDiary={() => router.push("/diary")}
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
            fetchMutations();
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

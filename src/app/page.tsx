"use client";

import { useUser, useAssets, useProfile, useSignOut } from "@/lib/hooks";
import ChatPopup from "@/components/ChatPopup";
import { NavBar } from "@/components/NavBar";
import { PortfolioTab } from "@/components/PortfolioTab";
import { DiaryTab } from "@/components/DiaryTab";
import { ProfileTab } from "@/components/ProfileTab";
import { useState, useEffect, useCallback } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import { getWarnings, type DashboardMutation } from "@/lib/utils";
import type { LiveAsset } from "@/lib/supabase";

const supabase = createBrowserSupabase();

export default function Dashboard() {
  const { user, loading: userLoading } = useUser();
  const profile = useProfile(user?.id);
  const {
    assets, loading: assetsLoading, refreshing, lastUpdated,
    refreshPrices, refetchAssets,
  } = useAssets(user?.id);
  const signOut = useSignOut();
  const [chatOpen, setChatOpen] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const [tab, setTab] = useState<"portfolio" | "diary" | "profile">("portfolio");
  const [mutations, setMutations] = useState<DashboardMutation[]>([]);
  const [diaryFilter, setDiaryFilter] = useState<string>("all");

  const fetchMutations = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("mutations")
      .select("*")
      .eq("user_id", user.id)
      .order("occurred_at", { ascending: false, nullsFirst: false });
    setMutations(data || []);
  }, [user?.id]);

  useEffect(() => { fetchMutations(); }, [fetchMutations]);

  // Backfill zero-value assets when diary tab is opened (runs once per session)
  useEffect(() => {
    if (tab !== "diary" || !user?.id) return;
    fetch("/api/backfill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id }),
    }).then(async (res) => {
      const { updated } = await res.json();
      if (updated > 0) {
        refetchAssets();
        fetchMutations();
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user?.id]);

  if (userLoading || assetsLoading) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] flex items-center justify-center">
        <div className="text-[#9CA3AF] text-sm">Loading…</div>
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
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap"
        rel="stylesheet"
      />
      <div className="min-h-screen bg-[#F8F7F4]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <NavBar
          tab={tab}
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
          {assets.length === 0 && tab === "portfolio" ? (
            <div className="flex flex-col items-center pt-24 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#2563EB]/10 flex items-center justify-center text-[#2563EB] text-2xl font-bold mb-6">
                V
              </div>
              <div className="text-[48px] font-extrabold tracking-tighter text-[#0F0E0C] leading-none mb-3">€0</div>
              <div className="text-sm text-gray-400 mb-2">No positions yet</div>
              <p className="text-gray-300 text-xs max-w-xs leading-relaxed mb-8">
                Tell the assistant what you own — stocks, real estate, cash — and it will build your portfolio automatically.
              </p>
              <button
                onClick={() => setChatOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-[#2563EB] text-white text-sm font-semibold hover:bg-[#1D4ED8] transition-colors"
              >
                Add your first asset →
              </button>
            </div>
          ) : tab === "portfolio" ? (
            <PortfolioTab
              assets={assets as LiveAsset[]}
              sorted={sorted}
              byType={byType}
              grossTotal={grossTotal}
              netTotal={netTotal}
              totalDebt={totalDebt}
              topAsset={topAsset as LiveAsset}
              warnings={warnings}
              mutations={mutations}
              setTab={setTab}
            />
          ) : tab === "diary" ? (
            <DiaryTab
              mutations={mutations}
              diaryFilter={diaryFilter}
              setDiaryFilter={setDiaryFilter}
            />
          ) : (
            <ProfileTab
              profile={profile}
              mutationCount={mutations.length}
            />
          )}
        </div>

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
    </>
  );
}

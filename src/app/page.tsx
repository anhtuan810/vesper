"use client";

import { useUser, useAssets, useProfile, useSignOut } from "@/lib/hooks";
import ChatPopup from "@/components/ChatPopup";
import { NavBar } from "@/components/NavBar";
import { PortfolioTab } from "@/components/PortfolioTab";
import { DiaryTab } from "@/components/DiaryTab";
import { ProfileTab } from "@/components/ProfileTab";
import { useState, useEffect } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import { getWarnings, type DashboardMutation } from "@/lib/utils";
import type { LiveAsset } from "@/lib/supabase";

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

  const supabase = createBrowserSupabase();

  useEffect(() => {
    if (!user?.id) return;
    async function fetchMutations() {
      const { data } = await supabase
        .from("mutations")
        .select("*")
        .eq("user_id", user!.id)
        .order("occurred_at", { ascending: false, nullsFirst: false });
      setMutations(data || []);
    }
    fetchMutations();
  }, [user?.id, assets]);

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

        <div className="max-w-[960px] mx-auto px-8 pt-10 pb-36">
          {assets.length === 0 ? (
            <div className="text-center pt-20">
              <div className="text-sm text-gray-400 mb-2">No positions yet</div>
              <div className="text-6xl font-extrabold tracking-tighter text-[#0F0E0C] leading-none mb-6">€0</div>
              <p className="text-gray-400 mb-8 text-sm">Use the assistant to add your first assets.</p>
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

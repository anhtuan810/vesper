"use client";

import { useUser, useAssets, useProfile, useSignOut } from "@/lib/hooks";
import ChatPopup from "@/components/ChatPopup";
import { useState } from "react";

const TYPE_COLOR: Record<string, string> = {
  stocks: "#2563EB", etf: "#0891B2", crypto: "#7C3AED",
  bonds: "#059669", gold: "#D97706", real_estate: "#DC2626",
  cash: "#475569", pension: "#6366F1", other: "#78716C",
};

const TYPE_LABEL: Record<string, string> = {
  stocks: "Stocks", etf: "ETF", crypto: "Crypto", bonds: "Bonds",
  gold: "Gold", real_estate: "Real Estate", cash: "Cash",
  pension: "Pension", other: "Other",
};

function fmt(n: number) {
  if (n >= 1000000) return `€${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `€${(n / 1000).toFixed(1)}k`;
  return `€${Math.round(n)}`;
}

function pctChange(price?: number, prev?: number) {
  if (!price || !prev) return null;
  return ((price - prev) / prev) * 100;
}

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

  if (userLoading || assetsLoading) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] flex items-center justify-center">
        <div className="text-[#9CA3AF] text-sm">Loading…</div>
      </div>
    );
  }

  const total = assets.reduce((sum, a) => {
    const net = a.type === "real_estate" && a.mortgage_balance
      ? a.value - a.mortgage_balance
      : a.value;
    return sum + net;
  }, 0);

  const byType = assets.reduce((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + a.value;
    return acc;
  }, {} as Record<string, number>);

  const sorted = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  const countries = [...new Set(assets.map((a) => a.country).filter(Boolean))];
  const liveCount = assets.filter((a: any) => a.livePrice).length;
  const totalSymbols = assets.filter((a) => a.symbol).length;

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap"
        rel="stylesheet"
      />
      <div className="min-h-screen bg-[#F8F7F4]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>

        {/* Nav */}
        <nav className="sticky top-0 z-20 border-b border-black/5 bg-[#F8F7F4]/80 backdrop-blur-xl">
          <div className="max-w-[900px] mx-auto flex items-center justify-between px-8 h-14">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#2563EB] flex items-center justify-center text-white text-sm font-bold">V</div>
              <span className="text-base font-bold tracking-tight">Vesper</span>
            </div>
            <div className="flex items-center gap-3">
              {totalSymbols > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${liveCount > 0 ? "bg-emerald-500" : "bg-gray-400"}`}
                    style={liveCount > 0 ? { boxShadow: "0 0 0 2px #D1FAE5" } : {}} />
                  <span className="text-xs text-gray-400 font-medium">
                    {liveCount > 0 ? `${liveCount}/${totalSymbols} live` : "offline"}
                  </span>
                </div>
              )}
              {lastUpdated && (
                <span className="text-xs text-gray-300">
                  {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              <button
                onClick={refreshPrices}
                disabled={refreshing}
                className="text-xs font-semibold text-gray-400 px-2.5 py-1 rounded-md border border-black/5 hover:bg-[#ECEAE4] transition"
              >
                {refreshing ? "↻ …" : "↻ Refresh"}
              </button>
              {profile?.avatar_url && (
                <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full" />
              )}
              <button onClick={signOut} className="text-xs text-gray-300 hover:text-gray-500 transition">
                Sign out
              </button>
            </div>
          </div>
        </nav>

        {/* Main */}
        <div className="max-w-[900px] mx-auto px-8 pt-12 pb-36">

          {/* Empty state */}
          {assets.length === 0 ? (
            <div className="text-center pt-20">
              <div className="w-12 h-12 rounded-2xl bg-[#2563EB] flex items-center justify-center text-white text-xl font-bold mx-auto mb-4">V</div>
              <h2 className="text-2xl font-bold tracking-tight mb-2">Welcome to Vesper</h2>
              <p className="text-gray-400 mb-8 text-sm">
                Let's set up your portfolio. Click the button below to start chatting.
              </p>
              <button
                onClick={() => setChatOpen(true)}
                className="px-6 py-3 rounded-xl bg-[#2563EB] text-white text-sm font-semibold hover:bg-[#1D4ED8] transition"
              >
                Start setup ✦
              </button>
            </div>
          ) : (
            <>
              {/* Hero */}
              <div className="mb-12">
                <div className="text-sm font-medium text-gray-400 mb-2">Total net worth</div>
                <div className="text-[64px] font-extrabold tracking-tighter text-[#0F0E0C] leading-none mb-5">
                  {fmt(total)}
                </div>

                {/* Segment bar */}
                <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5 mb-4">
                  {sorted.map(([type, val]) => (
                    <div
                      key={type}
                      style={{ flex: val / total, background: TYPE_COLOR[type], opacity: 0.85 }}
                      className="rounded-full transition-all duration-500"
                    />
                  ))}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4">
                  {sorted.map(([type, val]) => (
                    <div key={type} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-sm" style={{ background: TYPE_COLOR[type] }} />
                      <span className="text-xs font-medium text-gray-400">{TYPE_LABEL[type]}</span>
                      <span className="text-xs text-gray-300">{((val / total) * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-10">
                {[
                  { label: "Positions", value: assets.length },
                  { label: "Countries", value: countries.length || "—" },
                  { label: "Asset classes", value: Object.keys(byType).length },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white rounded-2xl p-5 border border-black/5">
                    <div className="text-xs font-medium text-gray-400 mb-1.5">{label}</div>
                    <div className="text-3xl font-extrabold tracking-tight text-[#0F0E0C]">{value}</div>
                  </div>
                ))}
              </div>

              {/* Positions */}
              <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
                <div className="grid grid-cols-[2fr_90px_70px_100px_80px] px-6 py-3 border-b border-black/5">
                  {["Position", "Type", "Ctry", "Value", "Day"].map((h, i) => (
                    <div key={h} className={`text-[11px] font-semibold text-gray-300 uppercase tracking-wider ${i >= 3 ? "text-right" : ""}`}>
                      {h}
                    </div>
                  ))}
                </div>

                {assets.map((asset: any, i: number) => {
                  const isLive = !!asset.livePrice;
                  const chg = pctChange(asset.livePrice, asset.livePrev);
                  const up = chg !== null && chg >= 0;
                  const equity = asset.type === "real_estate" && asset.mortgage_balance
                    ? asset.value - asset.mortgage_balance
                    : asset.value;

                  return (
                    <div
                      key={asset.id}
                      className="grid grid-cols-[2fr_90px_70px_100px_80px] px-6 py-4 hover:bg-[#F0EEE9] transition-colors border-b border-black/[0.03] last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 relative"
                          style={{ background: `${TYPE_COLOR[asset.type]}15` }}
                        >
                          <div className="w-2.5 h-2.5 rounded" style={{ background: TYPE_COLOR[asset.type] }} />
                          {isLive && (
                            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-white" />
                          )}
                        </div>
                        <div>
                          <div className="text-[15px] font-semibold text-[#0F0E0C] tracking-tight">{asset.name}</div>
                          <div className="text-[11px] text-gray-300 mt-0.5">
                            {asset.symbol && <span className="font-mono text-[10px]">{asset.symbol}</span>}
                            {asset.units && <span> · {asset.units} units</span>}
                            {asset.type === "real_estate" && asset.mortgage_balance && (
                              <span> · equity {fmt(equity)}</span>
                            )}
                            {!asset.symbol && <span className="text-gray-200">manual</span>}
                          </div>
                        </div>
                      </div>

                      <div className="self-center">
                        <span
                          className="text-[10px] font-semibold rounded-md px-1.5 py-0.5"
                          style={{ color: TYPE_COLOR[asset.type], background: `${TYPE_COLOR[asset.type]}15` }}
                        >
                          {TYPE_LABEL[asset.type]}
                        </span>
                      </div>

                      <div className="text-[13px] font-medium text-gray-400 self-center">
                        {asset.country || "—"}
                      </div>

                      <div className="text-right self-center">
                        <div className="text-[15px] font-bold text-[#0F0E0C] tracking-tight">{fmt(asset.value)}</div>
                        {isLive && (
                          <div className="text-[10px] text-gray-300 font-mono mt-0.5">
                            @{asset.livePrice >= 1000 ? asset.livePrice.toLocaleString("en", { maximumFractionDigits: 0 }) : asset.livePrice.toFixed(2)}
                          </div>
                        )}
                      </div>

                      <div className="text-right self-center">
                        {isLive && chg !== null ? (
                          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold rounded-md px-1.5 py-0.5 ${up ? "text-emerald-600 bg-emerald-50" : "text-red-600 bg-red-50"}`}>
                            {up ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-200">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Chat */}
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

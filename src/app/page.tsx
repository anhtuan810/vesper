"use client";

import { useUser, useAssets, useProfile, useSignOut } from "@/lib/hooks";
import ChatPopup from "@/components/ChatPopup";
import { useState, useEffect } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import { getMilestoneProgress, fmtRemaining } from "@/lib/projection";

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

const ACTION_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  add: { label: "Added", color: "#059669", bg: "#ECFDF5" },
  edit: { label: "Updated", color: "#2563EB", bg: "#EFF6FF" },
  remove: { label: "Removed", color: "#DC2626", bg: "#FEF2F2" },
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

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function getMonthKey(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(key: string) {
  const [year, month] = key.split("-");
  const d = new Date(parseInt(year), parseInt(month) - 1);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

// SVG Donut Chart — shows NET worth
function DonutChart({ data, total, netTotal }: { data: [string, number][]; total: number; netTotal: number }) {
  const cx = 80, cy = 80, r = 62, stroke = 14;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <svg width={160} height={160} viewBox="0 0 160 160">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F0EEE9" strokeWidth={stroke} />
      {data.map(([type, val]) => {
        const pct = val / total;
        const dash = Math.max(pct * circ - 2, 0);
        const el = (
          <circle
            key={type}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={TYPE_COLOR[type] || "#78716C"}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${circ}`}
            strokeDashoffset={-offset * circ}
            strokeLinecap="butt"
            transform="rotate(-90 80 80)"
            style={{ transition: "all 0.6s ease" }}
          />
        );
        offset += pct;
        return el;
      })}
      <text x={cx} y={cy - 6} textAnchor="middle" fill="#9CA3AF" fontSize="9"
        fontFamily="'Plus Jakarta Sans', sans-serif" fontWeight="500">NET WORTH</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#0F0E0C" fontSize="18"
        fontFamily="'Plus Jakarta Sans', sans-serif" fontWeight="800" letterSpacing="-0.03em">
        {fmt(netTotal)}
      </text>
    </svg>
  );
}

// Concentration warnings
function getWarnings(assets: any[], byType: Record<string, number>, total: number) {
  const warnings: string[] = [];
  const sorted = [...assets].sort((a, b) => b.value - a.value);
  if (sorted.length > 0 && sorted[0].value / total > 0.4) {
    warnings.push(`${sorted[0].name} is ${((sorted[0].value / total) * 100).toFixed(0)}% of your portfolio — high concentration.`);
  }
  const typeEntries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  if (typeEntries.length > 0 && typeEntries[0][1] / total > 0.6) {
    warnings.push(`${TYPE_LABEL[typeEntries[0][0]]} makes up ${((typeEntries[0][1] / total) * 100).toFixed(0)}% — consider diversifying.`);
  }
  if (typeEntries.length === 1 && assets.length > 1) {
    warnings.push("All positions are in one asset class.");
  }
  if (byType.cash && byType.cash / total > 0.3) {
    warnings.push(`${((byType.cash / total) * 100).toFixed(0)}% in cash — consider deploying some.`);
  }
  return warnings;
}

interface Mutation {
  id: string;
  asset_name: string;
  action: string;
  before_value: number | null;
  after_value: number | null;
  personal_context: string | null;
  market_context: string | null;
  portfolio_total: number | null;
  occurred_at: string | null;
  recorded_at: string;
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
  const [tab, setTab] = useState<"portfolio" | "diary" | "profile">("portfolio");
  const [mutations, setMutations] = useState<Mutation[]>([]);
  const [mutationsLoading, setMutationsLoading] = useState(true);
  const [diaryFilter, setDiaryFilter] = useState<string>("all");

  const supabase = createBrowserSupabase();

  // Fetch mutations
  useEffect(() => {
    if (!user?.id) return;
    async function fetchMutations() {
      const { data } = await supabase
        .from("mutations")
        .select("*")
        .eq("user_id", user!.id)
        .order("occurred_at", { ascending: false, nullsFirst: false });
      setMutations(data || []);
      setMutationsLoading(false);
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
      ? a.value - a.mortgage_balance
      : a.value;
    return sum + net;
  }, 0);

  const grossTotal = assets.reduce((sum, a) => sum + a.value, 0);

  const byType = assets.reduce((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + a.value;
    return acc;
  }, {} as Record<string, number>);

  const sorted = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  const countries = [...new Set(assets.map((a) => a.country).filter(Boolean))];
  const liveCount = assets.filter((a: any) => a.livePrice).length;
  const totalSymbols = assets.filter((a) => a.symbol).length;
  const totalDebt = assets.reduce((sum, a) => sum + (a.mortgage_balance || 0), 0);
  const topAsset = [...assets].sort((a, b) => b.value - a.value)[0];
  const warnings = assets.length > 0 ? getWarnings(assets, byType, grossTotal) : [];

  // Diary data
  const filteredMutations = diaryFilter === "all" ? mutations : mutations.filter(m => m.action === diaryFilter);
  const grouped = filteredMutations.reduce((acc, m) => {
    const key = getMonthKey(m.occurred_at || m.recorded_at);
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {} as Record<string, Mutation[]>);
  const monthKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap"
        rel="stylesheet"
      />
      <div className="min-h-screen bg-[#F8F7F4]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>

        {/* Nav */}
        <nav className="sticky top-0 z-20 border-b border-black/5 bg-[#F8F7F4]/80 backdrop-blur-xl">
          <div className="max-w-[960px] mx-auto flex items-center justify-between px-8 h-14">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#2563EB] flex items-center justify-center text-white text-sm font-bold">V</div>
                <span className="text-base font-bold tracking-tight">Vesper</span>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 ml-4">
                <button
                  onClick={() => setTab("portfolio")}
                  className="text-sm font-medium px-3 py-1.5 rounded-lg transition"
                  style={{
                    background: tab === "portfolio" ? "#0F0E0C" : "transparent",
                    color: tab === "portfolio" ? "#fff" : "#9CA3AF",
                  }}
                >
                  Portfolio
                </button>
                <button
                  onClick={() => setTab("diary")}
                  className="text-sm font-medium px-3 py-1.5 rounded-lg transition flex items-center gap-2"
                  style={{
                    background: tab === "diary" ? "#0F0E0C" : "transparent",
                    color: tab === "diary" ? "#fff" : "#9CA3AF",
                  }}
                >
                  Diary
                  {mutations.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{
                      background: tab === "diary" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.06)",
                      color: tab === "diary" ? "#fff" : "#9CA3AF",
                    }}>
                      {mutations.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setTab("profile")}
                  className="text-sm font-medium px-3 py-1.5 rounded-lg transition"
                  style={{
                    background: tab === "profile" ? "#0F0E0C" : "transparent",
                    color: tab === "profile" ? "#fff" : "#9CA3AF",
                  }}
                >
                  Profile
                </button>
              </div>
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
        <div className="max-w-[960px] mx-auto px-8 pt-10 pb-36">

          {assets.length === 0 ? (
            <div className="text-center pt-20">
              <div className="text-sm text-gray-400 mb-2">No positions yet</div>
              <div className="text-6xl font-extrabold tracking-tighter text-[#0F0E0C] leading-none mb-6">€0</div>
              <p className="text-gray-400 mb-8 text-sm">Use the assistant to add your first assets.</p>
            </div>
          ) : tab === "portfolio" ? (
            <>
              {/* ==================== PORTFOLIO TAB ==================== */}

              {/* Hero: Net worth + Donut + Allocation */}
              <div className="bg-white rounded-2xl border border-black/5 p-8 mb-4">
                <div className="flex items-start gap-10">
                  <div className="shrink-0">
                    <DonutChart data={sorted} total={grossTotal} netTotal={netTotal} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-400 mb-1">Net worth</div>
                    <div className="text-[48px] font-extrabold tracking-tighter text-[#0F0E0C] leading-none mb-1">
                      {fmt(netTotal)}
                    </div>
                    {totalDebt > 0 && (
                      <div className="text-xs text-gray-300 mb-6">
                        Gross {fmt(grossTotal)} · Debt {fmt(totalDebt)}
                      </div>
                    )}
                    {totalDebt === 0 && <div className="mb-6" />}

                    <div className="space-y-2.5">
                      {sorted.map(([type, val]) => {
                        const pct = (val / grossTotal) * 100;
                        return (
                          <div key={type} className="flex items-center gap-3">
                            <div className="w-[72px] text-xs font-medium text-gray-400 shrink-0">
                              {TYPE_LABEL[type]}
                            </div>
                            <div className="flex-1 h-2 rounded-full bg-[#F0EEE9] overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${pct}%`, background: TYPE_COLOR[type], opacity: 0.85 }}
                              />
                            </div>
                            <div className="w-[36px] text-xs text-gray-400 text-right font-medium">
                              {pct.toFixed(0)}%
                            </div>
                            <div className="w-[64px] text-xs text-[#0F0E0C] text-right font-semibold">
                              {fmt(val)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Milestone progress bar */}
              {netTotal > 0 && (
                <div className="bg-white rounded-xl border border-black/5 px-5 py-4 mb-4">
                  {(() => {
                    const m = getMilestoneProgress(netTotal);
                    return (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs text-gray-400">
                            Next milestone
                          </div>
                          <div className="text-xs font-semibold text-[#0F0E0C]">
                            {m.label}
                          </div>
                        </div>
                        <div className="h-2 rounded-full bg-[#F0EEE9] overflow-hidden mb-2">
                          <div
                            className="h-full rounded-full transition-all duration-700 ease-out"
                            style={{
                              width: `${m.progress}%`,
                              background: "linear-gradient(90deg, #2563EB, #3B82F6)",
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] text-gray-300">
                            {m.progress.toFixed(0)}% there
                          </div>
                          <div className="text-[10px] text-gray-300">
                            {fmtRemaining(m.remaining)} to go
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200/60 rounded-xl px-5 py-3 mb-4">
                  {warnings.map((w, i) => (
                    <div key={i} className="text-xs text-amber-800 leading-relaxed">{w}</div>
                  ))}
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Positions", value: assets.length },
                  { label: "Countries", value: countries.length || "—" },
                  { label: "Asset classes", value: Object.keys(byType).length },
                  { label: "Largest", value: topAsset ? topAsset.name : "—", sub: topAsset ? `${((topAsset.value / grossTotal) * 100).toFixed(0)}%` : undefined },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="bg-white rounded-xl p-4 border border-black/5">
                    <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">{label}</div>
                    <div className="text-xl font-extrabold tracking-tight text-[#0F0E0C] truncate">{value}</div>
                    {sub && <div className="text-[10px] text-gray-300 mt-0.5">{sub}</div>}
                  </div>
                ))}
              </div>

              {/* Recent diary entries — preview */}
              {mutations.length > 0 && (
                <div className="bg-white rounded-2xl border border-black/5 p-5 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Recent activity</div>
                    <button
                      onClick={() => setTab("diary")}
                      className="text-[11px] font-medium text-[#2563EB] hover:underline"
                    >
                      View all →
                    </button>
                  </div>
                  <div className="space-y-2">
                    {mutations.slice(0, 3).map((m) => {
                      const style = ACTION_STYLE[m.action] || ACTION_STYLE.edit;
                      return (
                        <div key={m.id} className="flex items-center justify-between py-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                              style={{ color: style.color, background: style.bg }}
                            >
                              {style.label}
                            </span>
                            <span className="text-xs font-medium text-[#0F0E0C] truncate">{m.asset_name}</span>
                            {m.personal_context && (
                              <span className="text-[10px] text-gray-300 truncate hidden sm:inline">— {m.personal_context}</span>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-300 shrink-0 ml-2">
                            {formatDate(m.occurred_at || m.recorded_at)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Positions table */}
              <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
                <div className="px-6 py-3 border-b border-black/5 flex justify-between items-center">
                  <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Positions</div>
                  <div className="text-[11px] text-gray-300">{assets.length} holdings</div>
                </div>
                <div>
                  <div className="grid grid-cols-[2fr_90px_70px_100px_80px] px-6 py-2 border-b border-black/[0.03]">
                    {["Name", "Type", "Ctry", "Value", "Day"].map((h, i) => (
                      <div key={h} className={`text-[10px] font-semibold text-gray-300 uppercase tracking-wider ${i >= 3 ? "text-right" : ""}`}>
                        {h}
                      </div>
                    ))}
                  </div>

                  {[...assets].sort((a, b) => b.value - a.value).map((asset: any) => {
                    const isLive = !!asset.livePrice;
                    const chg = pctChange(asset.livePrice, asset.livePrev);
                    const up = chg !== null && chg >= 0;
                    const equity = asset.type === "real_estate" && asset.mortgage_balance
                      ? asset.value - asset.mortgage_balance : asset.value;
                    const positionPct = (asset.value / grossTotal) * 100;

                    return (
                      <div
                        key={asset.id}
                        className="grid grid-cols-[2fr_90px_70px_100px_80px] px-6 py-3.5 hover:bg-[#FAFAF8] transition-colors border-b border-black/[0.02] last:border-0"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 relative"
                            style={{ background: `${TYPE_COLOR[asset.type]}10` }}
                          >
                            <div className="w-2 h-2 rounded-sm" style={{ background: TYPE_COLOR[asset.type] }} />
                            {isLive && (
                              <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 border border-white" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[#0F0E0C] tracking-tight truncate">{asset.name}</div>
                            <div className="text-[10px] text-gray-300 mt-0.5 truncate">
                              {asset.symbol && <span className="font-mono">{asset.symbol}</span>}
                              {asset.units && <span> · {asset.units} units</span>}
                              {asset.type === "real_estate" && asset.mortgage_balance && (
                                <span> · equity {fmt(equity)}</span>
                              )}
                              {!asset.symbol && !asset.mortgage_balance && <span className="text-gray-200">manual</span>}
                              <span className="text-gray-200"> · {positionPct.toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                        <div className="self-center">
                          <span className="text-[10px] font-semibold rounded px-1.5 py-0.5"
                            style={{ color: TYPE_COLOR[asset.type], background: `${TYPE_COLOR[asset.type]}10` }}>
                            {TYPE_LABEL[asset.type]}
                          </span>
                        </div>
                        <div className="text-xs font-medium text-gray-400 self-center">{asset.country || "—"}</div>
                        <div className="text-right self-center">
                          <div className="text-sm font-bold text-[#0F0E0C] tracking-tight">{fmt(asset.value)}</div>
                          {isLive && (
                            <div className="text-[10px] text-gray-300 font-mono mt-0.5">
                              @{asset.livePrice >= 1000 ? asset.livePrice.toLocaleString("en", { maximumFractionDigits: 0 }) : asset.livePrice.toFixed(2)}
                            </div>
                          )}
                        </div>
                        <div className="text-right self-center">
                          {isLive && chg !== null ? (
                            <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold rounded px-1.5 py-0.5 ${up ? "text-emerald-600 bg-emerald-50" : "text-red-600 bg-red-50"}`}>
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
              </div>
            </>
          ) : tab === "diary" ? (
            <>
              {/* ==================== DIARY TAB ==================== */}

              {/* Diary stats */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-white rounded-xl p-4 border border-black/5">
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Added</div>
                  <div className="text-2xl font-extrabold tracking-tight text-[#059669]">
                    {mutations.filter(m => m.action === "add").length}
                  </div>
                </div>
                <div className="bg-white rounded-xl p-4 border border-black/5">
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Updated</div>
                  <div className="text-2xl font-extrabold tracking-tight text-[#2563EB]">
                    {mutations.filter(m => m.action === "edit").length}
                  </div>
                </div>
                <div className="bg-white rounded-xl p-4 border border-black/5">
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Removed</div>
                  <div className="text-2xl font-extrabold tracking-tight text-[#DC2626]">
                    {mutations.filter(m => m.action === "remove").length}
                  </div>
                </div>
              </div>

              {/* Filters */}
              <div className="flex gap-2 mb-6">
                {[
                  { key: "all", label: "All" },
                  { key: "add", label: "Added" },
                  { key: "edit", label: "Updated" },
                  { key: "remove", label: "Removed" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setDiaryFilter(key)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border transition"
                    style={{
                      background: diaryFilter === key ? "#0F0E0C" : "transparent",
                      color: diaryFilter === key ? "#fff" : "#9CA3AF",
                      borderColor: diaryFilter === key ? "#0F0E0C" : "rgba(0,0,0,0.06)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Empty */}
              {filteredMutations.length === 0 && (
                <div className="text-center pt-16">
                  <div className="text-sm text-gray-400 mb-2">No entries yet</div>
                  <p className="text-xs text-gray-300">
                    Your diary fills up as you add and modify positions through the assistant.
                  </p>
                </div>
              )}

              {/* Timeline */}
              {monthKeys.map((monthKey) => (
                <div key={monthKey} className="mb-8">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      {getMonthLabel(monthKey)}
                    </div>
                    <div className="flex-1 h-px bg-black/5" />
                    <div className="text-[10px] text-gray-300">
                      {grouped[monthKey].length} {grouped[monthKey].length === 1 ? "entry" : "entries"}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {grouped[monthKey].map((m) => {
                      const style = ACTION_STYLE[m.action] || ACTION_STYLE.edit;
                      const date = m.occurred_at || m.recorded_at;
                      const valueChange = m.action === "edit" && m.before_value != null && m.after_value != null
                        ? m.after_value - m.before_value : null;

                      return (
                        <div
                          key={m.id}
                          className="bg-white rounded-xl border border-black/5 px-5 py-4 hover:border-black/10 transition"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span
                                  className="text-[10px] font-semibold px-2 py-0.5 rounded"
                                  style={{ color: style.color, background: style.bg }}
                                >
                                  {style.label}
                                </span>
                                <span className="text-sm font-semibold text-[#0F0E0C] truncate">
                                  {m.asset_name}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 text-xs text-gray-400">
                                {m.action === "add" && m.after_value != null && (
                                  <span>{fmt(m.after_value)}</span>
                                )}
                                {m.action === "edit" && m.before_value != null && m.after_value != null && (
                                  <span>
                                    {fmt(m.before_value)} → {fmt(m.after_value)}
                                    {valueChange !== null && (
                                      <span className="ml-1.5 font-medium"
                                        style={{ color: valueChange >= 0 ? "#059669" : "#DC2626" }}>
                                        {valueChange >= 0 ? "+" : ""}{fmt(valueChange)}
                                      </span>
                                    )}
                                  </span>
                                )}
                                {m.action === "remove" && m.before_value != null && (
                                  <span>{fmt(m.before_value)}</span>
                                )}
                              </div>

                              {m.personal_context && (
                                <div className="text-xs text-gray-400 mt-2 leading-relaxed italic">
                                  "{m.personal_context}"
                                </div>
                              )}
                              {m.market_context && (
                                <div className="text-[10px] text-gray-300 mt-1.5 leading-relaxed">
                                  {m.market_context}
                                </div>
                              )}
                            </div>

                            <div className="text-right shrink-0">
                              <div className="text-xs font-medium text-gray-400">
                                {formatDate(date)}
                              </div>
                              {m.portfolio_total != null && (
                                <div className="text-[10px] text-gray-300 mt-1">
                                  Total: {fmt(m.portfolio_total)}
                                </div>
                              )}
                            </div>
                          </div>

                          {m.portfolio_total != null && m.portfolio_total > 0 && (
                            <div className="mt-3 h-1 rounded-full bg-[#F0EEE9] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-[#2563EB] transition-all duration-500"
                                style={{
                                  width: `${Math.min((m.portfolio_total / (mutations[0]?.portfolio_total || m.portfolio_total)) * 100, 100)}%`,
                                  opacity: 0.3,
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              {/* ==================== PROFILE TAB ==================== */}

              <div className="bg-white rounded-2xl border border-black/5 p-8 mb-4">
                <div className="flex items-start gap-4 mb-6">
                  {profile?.avatar_url && (
                    <img src={profile.avatar_url} alt="" className="w-14 h-14 rounded-xl" />
                  )}
                  <div>
                    <div className="text-xl font-bold tracking-tight text-[#0F0E0C]">
                      {profile?.name || "Investor"}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      What Vesper knows about you
                    </div>
                  </div>
                </div>

                <div className="text-xs text-gray-300 leading-relaxed mb-6">
                  This profile builds automatically from your conversations. The more you use Vesper, the better it understands your financial situation and preferences.
                </div>

                {profile?.profile && Object.keys(profile.profile).length > 0 ? (
                  <div className="space-y-4">
                    {[
                      { key: "goal", label: "Financial Goal", icon: "target" },
                      { key: "risk_behaviour", label: "Risk Behaviour", icon: "shield" },
                      { key: "investment_style", label: "Investment Style", icon: "chart" },
                      { key: "life_context", label: "Life Context", icon: "user" },
                      { key: "concerns", label: "Concerns", icon: "alert" },
                      { key: "preferences", label: "Preferences", icon: "settings" },
                      { key: "blind_spots", label: "Blind Spots", icon: "eye" },
                      { key: "decision_patterns", label: "Decision Patterns", icon: "brain" },
                      { key: "interests", label: "Interests", icon: "star" },
                    ].filter(({ key }) => profile.profile[key]).map(({ key, label }) => (
                      <div key={key} className="border-b border-black/[0.03] pb-4 last:border-0 last:pb-0">
                        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                          {label}
                        </div>
                        <div className="text-sm text-[#0F0E0C] leading-relaxed">
                          {profile.profile[key]}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10">
                    <div className="text-sm text-gray-400 mb-2">No profile data yet</div>
                    <div className="text-xs text-gray-300 leading-relaxed max-w-sm mx-auto">
                      Start chatting with the assistant about your investments, goals, and concerns. Vesper will gradually learn about your financial profile.
                    </div>
                  </div>
                )}
              </div>

              {/* Stats about profile */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-xl p-4 border border-black/5">
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Conversations</div>
                  <div className="text-2xl font-extrabold tracking-tight text-[#0F0E0C]">
                    {mutations.length}
                  </div>
                </div>
                <div className="bg-white rounded-xl p-4 border border-black/5">
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Profile fields</div>
                  <div className="text-2xl font-extrabold tracking-tight text-[#0F0E0C]">
                    {profile?.profile ? Object.keys(profile.profile).length : 0}
                  </div>
                </div>
                <div className="bg-white rounded-xl p-4 border border-black/5">
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Member since</div>
                  <div className="text-sm font-extrabold tracking-tight text-[#0F0E0C] mt-1.5">
                    {new Date().toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                  </div>
                </div>
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

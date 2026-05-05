"use client";

import { DonutChart } from "@/components/DonutChart";
import { fmt, pctChange, formatDate, TYPE_COLOR, TYPE_LABEL, ACTION_STYLE, type DashboardMutation } from "@/lib/utils";
import { getMilestoneProgress, fmtRemaining } from "@/lib/projection";
import type { LiveAsset } from "@/lib/supabase";

interface PortfolioTabProps {
  assets: LiveAsset[];
  sorted: [string, number][];
  byType: Record<string, number>;
  grossTotal: number;
  netTotal: number;
  totalDebt: number;
  topAsset: LiveAsset | undefined;
  warnings: string[];
  mutations: DashboardMutation[];
  setTab: (tab: "portfolio" | "diary" | "profile") => void;
}

export function PortfolioTab({
  assets, sorted, byType, grossTotal, netTotal, totalDebt,
  topAsset, warnings, mutations, setTab,
}: PortfolioTabProps) {
  const countries = [...new Set(assets.map((a) => a.country).filter(Boolean))];

  return (
    <>
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
            {totalDebt > 0 ? (
              <div className="text-xs text-gray-300 mb-6">
                Gross {fmt(grossTotal)} · Debt {fmt(totalDebt)}
              </div>
            ) : (
              <div className="mb-6" />
            )}

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
      {netTotal > 0 && (() => {
        const m = getMilestoneProgress(netTotal);
        return (
          <div className="bg-white rounded-xl border border-black/5 px-5 py-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-gray-400">Next milestone</div>
              <div className="text-xs font-semibold text-[#0F0E0C]">{m.label}</div>
            </div>
            <div className="h-2 rounded-full bg-[#F0EEE9] overflow-hidden mb-2">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${m.progress}%`, background: "linear-gradient(90deg, #2563EB, #3B82F6)" }}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-gray-300">{m.progress.toFixed(0)}% there</div>
              <div className="text-[10px] text-gray-300">{fmtRemaining(m.remaining)} to go</div>
            </div>
          </div>
        );
      })()}

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
          {
            label: "Largest",
            value: topAsset ? topAsset.name : "—",
            sub: topAsset ? `${((topAsset.value / grossTotal) * 100).toFixed(0)}%` : undefined,
          },
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

          {[...assets].sort((a, b) => b.value - a.value).map((asset) => {
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
                      @{asset.livePrice! >= 1000
                        ? asset.livePrice!.toLocaleString("en", { maximumFractionDigits: 0 })
                        : asset.livePrice!.toFixed(2)}
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
  );
}

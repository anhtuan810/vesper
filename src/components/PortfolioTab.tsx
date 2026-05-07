"use client";

import { NetWorthHero } from "@/components/NetWorthHero";
import { AllocationBar } from "@/components/AllocationBar";
import { PositionRow } from "@/components/PositionRow";
import { fmt, formatDate, TYPE_COLOR, TYPE_LABEL, ACTION_STYLE, type DashboardMutation } from "@/lib/utils";
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
  onViewDiary: () => void;
}

export function PortfolioTab({
  assets, sorted, byType, grossTotal, netTotal, totalDebt,
  topAsset, warnings, mutations, onViewDiary,
}: PortfolioTabProps) {
  const countries = [...new Set(assets.map((a) => a.country).filter(Boolean))];
  const allocationItems = sorted.map(([type, val]) => ({
    label: TYPE_LABEL[type] ?? type,
    value: val,
    color: TYPE_COLOR[type] ?? "#54545E",
  }));

  return (
    <>
      {/* Hero: Net worth + Allocation */}
      <div className="bg-surface rounded-2xl border border-border p-5 sm:p-8 mb-4">
        <NetWorthHero netTotal={netTotal} grossTotal={grossTotal} totalDebt={totalDebt} />
        <div className="mt-8">
          <AllocationBar items={allocationItems} total={grossTotal} />
        </div>
      </div>

      {/* Milestone progress */}
      {netTotal > 0 && (() => {
        const m = getMilestoneProgress(netTotal);
        return (
          <div className="bg-surface rounded-xl border border-border px-5 py-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-mono text-faint" style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase" }}>
                Next milestone
              </div>
              <div className="font-mono text-fg" style={{ fontSize: 12, fontWeight: 500 }}>{m.label}</div>
            </div>
            <div className="h-[5px] rounded-full bg-surface-elev overflow-hidden mb-2" style={{ border: "1px solid var(--border)" }}>
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${m.progress}%`, background: "var(--accent)", boxShadow: "0 0 8px rgba(212,165,116,0.3)" }}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="font-mono text-faint" style={{ fontSize: 10 }}>{m.progress.toFixed(0)}% there</div>
              <div className="font-mono text-faint" style={{ fontSize: 10 }}>{fmtRemaining(m.remaining)} to go</div>
            </div>
          </div>
        );
      })()}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div
          className="rounded-xl px-5 py-3 mb-4"
          style={{
            background: "var(--accent-soft)",
            border: "1px solid rgba(212,165,116,0.18)",
          }}
        >
          {warnings.map((w, i) => (
            <div key={i} className="text-xs text-accent leading-relaxed">{w}</div>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
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
          <div key={label} className="bg-surface rounded-xl p-4 border border-border">
            <div
              className="font-mono text-faint uppercase mb-2"
              style={{ fontSize: 9, letterSpacing: "0.18em" }}
            >
              {label}
            </div>
            <div className="font-mono text-fg truncate" style={{ fontSize: 17, fontWeight: 500 }}>
              {value}
            </div>
            {sub && (
              <div className="font-mono text-dim mt-1" style={{ fontSize: 10 }}>{sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* Recent diary entries — preview */}
      {mutations.length > 0 && (
        <div className="bg-surface rounded-2xl border border-border p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div
              className="font-mono text-faint uppercase"
              style={{ fontSize: 10, letterSpacing: "0.18em" }}
            >
              Recent activity
            </div>
            <button
              onClick={onViewDiary}
              className="font-mono text-accent hover:opacity-80 transition-opacity"
              style={{ fontSize: 11, letterSpacing: "0.04em" }}
            >
              View all →
            </button>
          </div>
          <div>
            {mutations.slice(0, 3).map((m) => {
              const style = ACTION_STYLE[m.action] || ACTION_STYLE.edit;
              return (
                <div key={m.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="font-mono shrink-0"
                      style={{
                        fontSize: 9, fontWeight: 500,
                        padding: "2px 6px", borderRadius: 4,
                        letterSpacing: "0.1em",
                        color: style.color, background: style.bg,
                      }}
                    >
                      {style.label}
                    </span>
                    <span className="text-[13px] font-medium text-fg truncate">{m.asset_name}</span>
                    {m.personal_context && (
                      <span className="text-dim text-[11px] italic truncate hidden sm:inline">
                        — {m.personal_context}
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-faint shrink-0 ml-2" style={{ fontSize: 10 }}>
                    {formatDate(m.occurred_at || m.recorded_at)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Positions list */}
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <div
            className="font-serif text-fg"
            style={{ fontSize: 18, fontWeight: 400, fontVariationSettings: "'opsz' 144" }}
          >
            Positions
          </div>
          <div className="font-mono text-faint" style={{ fontSize: 11 }}>
            {assets.length} holdings
          </div>
        </div>
        <div>
          {[...assets]
            .sort((a, b) => b.value - a.value)
            .map((asset) => (
              <PositionRow key={asset.id} asset={asset} />
            ))}
        </div>
      </div>
    </>
  );
}

"use client";

import { useMemo, useState, useEffect } from "react";
import { NetWorthHero } from "@/components/NetWorthHero";
import { NetWorthChart } from "@/components/NetWorthChart";
import { AllocationBar } from "@/components/AllocationBar";
import { PositionRow } from "@/components/PositionRow";
import { formatDate, TYPE_COLOR, TYPE_LABEL, ACTION_STYLE, type Warning } from "@/lib/utils";
import { useSparklines, useDisplayCurrency } from "@/lib/hooks";
import type { LiveAsset, Mutation } from "@/lib/supabase";
import { getMilestoneProgress, fmtRemaining } from "@/lib/projection";
import type { DisplayCurrency } from "@/lib/money";

interface PortfolioTabProps {
  assets: LiveAsset[];
  sorted: [string, number][];
  byType: Record<string, number>;
  grossTotal: number;
  netTotal: number;
  totalDebt: number;
  warnings: Warning[];
  mutations: Mutation[];
  onViewDiary: () => void;
}

export function PortfolioTab({
  assets, sorted, byType, grossTotal, netTotal, totalDebt,
  warnings, mutations, onViewDiary,
}: PortfolioTabProps) {
  const displayCurrency = useDisplayCurrency();
  const [dismissed, setDismissed] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem("vesper.dismissed_warnings");
      if (raw) setDismissed(JSON.parse(raw));
    } catch {}
  }, []);

  const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

  const visibleWarnings = warnings.filter((w) => {
    const ts = dismissed[w.key];
    if (!ts) return true;
    return Date.now() - new Date(ts).getTime() >= NINETY_DAYS_MS;
  });

  const dismissWarning = (key: string) => {
    setDismissed((prev) => {
      const next = { ...prev, [key]: new Date().toISOString() };
      try {
        localStorage.setItem("vesper.dismissed_warnings", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const symbols = useMemo(
    () => assets.map((a) => a.symbol).filter((s): s is string => !!s),
    [assets]
  );
  const sparklines = useSparklines(symbols, "1W");

  const sortedByValue = useMemo(() => [...assets].sort((a, b) => b.value - a.value), [assets]);
  const allocationItems = sorted.map(([type, val]) => ({
    label: TYPE_LABEL[type] ?? type,
    value: val,
    color: TYPE_COLOR[type] ?? "#54545E",
  }));

  return (
    <>
      {/* Hero: Net worth */}
      <div className="bg-surface rounded-2xl border border-border p-5 sm:p-8 mb-4">
        <NetWorthHero netTotal={netTotal} grossTotal={grossTotal} totalDebt={totalDebt} />
      </div>

      {/* Net worth chart — flush against page background, no card wrapper */}
      {netTotal > 0 && (
        <div className="mb-4">
          <NetWorthChart currentNet={netTotal} />
        </div>
      )}

      {/* Allocation */}
      <div className="bg-surface rounded-2xl border border-border p-5 sm:p-8 mb-4">
        <div style={{ marginBottom: 16 }}>
          <div className="flex items-baseline justify-between">
            <div
              className="font-serif text-fg"
              style={{ fontSize: 18, fontWeight: 400, fontVariationSettings: "'opsz' 144" }}
            >
              Gross allocation
            </div>
            <button
              onClick={() => {
                document.getElementById("positions")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="font-mono uppercase"
              style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.04em", cursor: "pointer", background: "none", border: "none", padding: 0 }}
            >
              Details
            </button>
          </div>
          <div
            className="font-mono mt-1"
            style={{ fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.04em" }}
          >
            By position value, before mortgages
          </div>
        </div>
        <AllocationBar items={allocationItems} total={grossTotal} />
      </div>

      {/* Milestone progress */}
      {netTotal > 0 && (() => {
        const m = getMilestoneProgress(netTotal, displayCurrency as DisplayCurrency);
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
              <div className="font-mono text-faint" style={{ fontSize: 10 }}>{fmtRemaining(m.remaining, displayCurrency)} to go</div>
            </div>
          </div>
        );
      })()}

      {/* Warnings */}
      {visibleWarnings.length > 0 && (
        <div
          className="rounded-xl px-5 py-3 mb-4"
          style={{
            background: "var(--accent-soft)",
            border: "1px solid rgba(212,165,116,0.18)",
          }}
        >
          {visibleWarnings.map((w, i) => (
            <div
              key={w.key}
              className="flex items-start justify-between"
              style={{ paddingTop: i > 0 ? 6 : 0 }}
            >
              <div className="text-xs text-accent leading-relaxed">{w.text}</div>
              <button
                onClick={() => dismissWarning(w.key)}
                aria-label="Dismiss"
                className="text-accent hover:opacity-60 transition-opacity ml-3 shrink-0"
                style={{
                  fontSize: 14,
                  lineHeight: 1,
                  padding: "0 4px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

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
        <div id="positions" className="flex items-baseline justify-between mb-3">
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
          {sortedByValue.map((asset) => (
            <PositionRow
              key={asset.id}
              asset={asset}
              closes={asset.symbol ? sparklines[asset.symbol] : []}
            />
          ))}
        </div>
      </div>
    </>
  );
}

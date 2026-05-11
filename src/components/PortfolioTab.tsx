"use client";

import { useMemo, useState, useEffect } from "react";
import { NetWorthHero } from "@/components/NetWorthHero";
import { NetWorthChart } from "@/components/NetWorthChart";
import { AllocationBar } from "@/components/AllocationBar";
import { PositionRow } from "@/components/PositionRow";
import { HoldingsGroup } from "@/components/HoldingsGroup";
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

  // Group assets by type, sort groups by total value desc, rows within group by value desc
  const groups = useMemo(() => {
    const byType: Record<string, LiveAsset[]> = {};
    for (const a of assets) {
      (byType[a.type] ??= []).push(a);
    }
    return Object.entries(byType)
      .map(([type, items]) => ({
        type,
        label: TYPE_LABEL[type] ?? type,
        items: [...items].sort((a, b) => b.value - a.value),
        total: items.reduce((s, a) => s + a.value, 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [assets]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Initialize all groups as expanded on first render
  const isExpanded = (type: string) => expanded[type] !== false;
  const toggleGroup = (type: string) =>
    setExpanded((prev) => ({ ...prev, [type]: !isExpanded(type) }));

  const allocationItems = sorted.map(([type, val]) => ({
    label: TYPE_LABEL[type] ?? type,
    value: val,
    color: TYPE_COLOR[type] ?? "#54545E",
  }));

  return (
    <>
      {/* Hero: Net worth — no card wrapper, directly on bg */}
      <div className="mb-5">
        <NetWorthHero netTotal={netTotal} grossTotal={grossTotal} totalDebt={totalDebt} />
      </div>

      {/* Net worth chart */}
      {netTotal > 0 && (
        <div className="mb-6">
          <NetWorthChart currentNet={netTotal} />
        </div>
      )}

      {/* Milestone progress */}
      {netTotal > 0 && (() => {
        const m = getMilestoneProgress(netTotal, displayCurrency as DisplayCurrency);
        return (
          <div
            className="mb-5 -mx-4 sm:-mx-8 px-4 sm:px-8 py-[14px]"
            style={{ background: "var(--accent-soft)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <div
                style={{
                  fontSize: 10, fontWeight: 500, letterSpacing: "0.18em",
                  textTransform: "uppercase", color: "var(--accent-text)", opacity: 0.7,
                }}
              >
                Next milestone
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>{m.label}</div>
            </div>
            <div
              className="h-[5px] rounded-full overflow-hidden mb-2"
              style={{ background: "rgba(0,0,0,0.08)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${m.progress}%`, background: "var(--accent)" }}
              />
            </div>
            <div className="flex items-center justify-between">
              <div style={{ fontSize: 10, color: "var(--accent-text)" }}>{m.progress.toFixed(0)}% there</div>
              <div style={{ fontSize: 10, color: "var(--accent-text)" }}>{fmtRemaining(m.remaining, displayCurrency)} to go</div>
            </div>
          </div>
        );
      })()}

      {/* Warnings */}
      {visibleWarnings.length > 0 && (
        <div
          className="rounded-xl px-5 py-3 mb-5"
          style={{
            background: "var(--accent-soft)",
            border: "1px solid var(--border)",
          }}
        >
          {visibleWarnings.map((w, i) => (
            <div
              key={w.key}
              className="flex items-start justify-between"
              style={{ paddingTop: i > 0 ? 6 : 0 }}
            >
              <div className="text-xs leading-relaxed" style={{ color: "var(--accent-text)" }}>{w.text}</div>
              <button
                onClick={() => dismissWarning(w.key)}
                aria-label="Dismiss"
                className="hover:opacity-60 transition-opacity ml-3 shrink-0"
                style={{
                  fontSize: 14, lineHeight: 1, padding: "0 4px",
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--accent-text)",
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Allocation */}
      <div className="bg-surface rounded-2xl border border-border p-5 sm:p-8 mb-5">
        <div className="flex items-baseline justify-between mb-4">
          <div
            className="font-serif"
            style={{
              fontSize: 26, fontWeight: 500, letterSpacing: "-0.01em",
              color: "var(--text)", fontVariationSettings: "'opsz' 24",
            }}
          >
            Allocation
          </div>
          <button
            onClick={() => {
              document.getElementById("holdings")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            style={{
              fontSize: 13, color: "var(--accent)", cursor: "pointer",
              background: "none", border: "none", padding: 0, fontWeight: 500,
            }}
          >
            Details
          </button>
        </div>
        <div
          className="text-faint mb-4"
          style={{ fontSize: 12 }}
        >
          By position value, before mortgages
        </div>
        <AllocationBar items={allocationItems} total={grossTotal} />
      </div>

      {/* Recent diary entries — preview */}
      {mutations.length > 0 && (
        <div className="bg-surface rounded-2xl border border-border p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <div
              style={{
                fontSize: 10, fontWeight: 500, letterSpacing: "0.18em",
                textTransform: "uppercase", color: "var(--text-faint)",
              }}
            >
              Recent activity
            </div>
            <button
              onClick={onViewDiary}
              className="hover:opacity-80 transition-opacity"
              style={{ fontSize: 13, color: "var(--accent)", fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: 0 }}
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

      {/* Holdings list */}
      <div>
        <div id="holdings" className="flex items-baseline justify-between mb-3">
          <div
            className="font-serif"
            style={{
              fontSize: 26, fontWeight: 500, letterSpacing: "-0.01em",
              color: "var(--text)", fontVariationSettings: "'opsz' 24",
            }}
          >
            Holdings
          </div>
          <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
            {assets.length} {assets.length === 1 ? "position" : "positions"}
          </div>
        </div>
        <div>
          {groups.map((group) => (
            <HoldingsGroup
              key={group.type}
              label={group.label}
              barColor={TYPE_COLOR[group.type] ?? "var(--accent)"}
              barPct={grossTotal > 0 ? Math.max((group.total / grossTotal) * 100, 2) : 2}
              expanded={isExpanded(group.type)}
              onToggle={() => toggleGroup(group.type)}
            >
              {group.items.map((asset) => (
                <PositionRow
                  key={asset.id}
                  asset={asset}
                  closes={asset.symbol ? sparklines[asset.symbol] : []}
                />
              ))}
            </HoldingsGroup>
          ))}
        </div>
      </div>
    </>
  );
}

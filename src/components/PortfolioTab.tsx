"use client";

import { useMemo, useState, useEffect } from "react";
import { NetWorthHero } from "@/components/NetWorthHero";
import { NetWorthChart } from "@/components/NetWorthChart";
import { InsightBand } from "@/components/InsightBand";
import { PositionRow } from "@/components/PositionRow";
import { HoldingsGroup } from "@/components/HoldingsGroup";
import { type Warning } from "@/lib/utils";
import { useSparklines } from "@/lib/hooks";
import type { LiveAsset } from "@/lib/supabase";

// Semantic category mapping — 3 groups, regardless of how many asset types exist
const CATEGORY_MAP: Record<string, string> = {
  real_estate: "property",
  stocks:      "markets",
  etf:         "markets",
  crypto:      "markets",
  cash:        "reserves",
  pension:     "reserves",
  bonds:       "reserves",
  gold:        "reserves",
  other:       "reserves",
};

const CATEGORY_LABEL: Record<string, string> = {
  property: "Property",
  markets:  "Public markets",
  reserves: "Reserves",
};

// CSS variable references — resolved at paint time, respects light/dark theme
const CATEGORY_COLOR: Record<string, string> = {
  property: "var(--accent)",
  markets:  "var(--category-public-markets)",
  reserves: "var(--category-reserves)",
};

interface PortfolioTabProps {
  assets: LiveAsset[];
  grossTotal: number;
  netTotal: number;
  warnings: Warning[];
}

export function PortfolioTab({
  assets, grossTotal, netTotal, warnings,
}: PortfolioTabProps) {
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

  // Group by semantic category, sort groups by total value desc, rows within group by value desc
  const groups = useMemo(() => {
    const byCategory: Record<string, LiveAsset[]> = {};
    for (const a of assets) {
      const cat = CATEGORY_MAP[a.type] ?? "reserves";
      (byCategory[cat] ??= []).push(a);
    }
    return Object.entries(byCategory)
      .map(([cat, items]) => ({
        category: cat,
        label: CATEGORY_LABEL[cat] ?? cat,
        items: [...items].sort((a, b) => b.value - a.value),
        total: items.reduce((s, a) => s + a.value, 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [assets]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const isExpanded = (cat: string) => expanded[cat] !== false;
  const toggleGroup = (cat: string) =>
    setExpanded((prev) => ({ ...prev, [cat]: !isExpanded(cat) }));

  return (
    <>
      {/* Hero: Net worth — no card wrapper, directly on bg */}
      <div className="mb-5">
        <NetWorthHero netTotal={netTotal} />
      </div>

      {/* Net worth chart */}
      {netTotal > 0 && (
        <div className="mb-6">
          <NetWorthChart currentNet={netTotal} />
        </div>
      )}

      {/* AI insight band — replaces milestone bar */}
      <InsightBand />

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

      {/* Holdings list — 3 semantic categories */}
      <div>
        <div className="flex items-baseline justify-between mb-3">
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
              key={group.category}
              label={group.label}
              barColor={CATEGORY_COLOR[group.category] ?? "var(--accent)"}
              barPct={grossTotal > 0 ? Math.max((group.total / grossTotal) * 100, 2) : 2}
              expanded={isExpanded(group.category)}
              onToggle={() => toggleGroup(group.category)}
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

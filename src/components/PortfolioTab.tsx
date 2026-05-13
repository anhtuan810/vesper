"use client";

import { useMemo, useState, useEffect } from "react";
import { NetWorthHero } from "@/components/NetWorthHero";
import { NetWorthChart, type SnapshotPoint } from "@/components/NetWorthChart";
import { InsightBand } from "@/components/InsightBand";
import { PositionRow } from "@/components/PositionRow";
import { HoldingsGroup } from "@/components/HoldingsGroup";
import { useSparklines } from "@/lib/hooks";
import type { LiveAsset } from "@/lib/supabase";

// Semantic category mapping — 4 groups, regardless of how many asset types exist
const CATEGORY_MAP: Record<string, string> = {
  real_estate: "property",
  stocks:      "markets",
  etf:         "markets",
  crypto:      "crypto",
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
  crypto:   "Crypto",
};

// CSS variable references — resolved at paint time, respects light/dark theme
const CATEGORY_COLOR: Record<string, string> = {
  property: "var(--category-property)",
  markets:  "var(--category-public-markets)",
  reserves: "var(--category-reserves)",
  crypto:   "var(--category-crypto)",
};

const ALL_CATEGORIES = ["property", "markets", "reserves", "crypto"] as const;

interface PortfolioTabProps {
  assets: LiveAsset[];
  grossTotal: number;
  netTotal: number;
  initialSnapshots?: SnapshotPoint[];
}

export function PortfolioTab({
  assets, grossTotal, netTotal, initialSnapshots,
}: PortfolioTabProps) {
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

  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(ALL_CATEGORIES.map((c) => [c, false]))
  );

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("vesper.holdings.expanded");
      if (raw) {
        const keys: string[] = JSON.parse(raw);
        setExpanded((prev) => {
          const next = { ...prev };
          for (const k of keys) next[k] = true;
          return next;
        });
      }
    } catch {}
  }, []);

  const isExpanded = (cat: string) => expanded[cat] === true;
  const toggleGroup = (cat: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [cat]: !prev[cat] };
      try {
        const expandedKeys = Object.entries(next).filter(([, v]) => v).map(([k]) => k);
        sessionStorage.setItem("vesper.holdings.expanded", JSON.stringify(expandedKeys));
      } catch {}
      return next;
    });
  };

  return (
    <>
      {/* Hero: Net worth — no card wrapper, directly on bg */}
      <div className="mb-5">
        <NetWorthHero netTotal={netTotal} />
      </div>

      {/* Net worth chart */}
      {netTotal > 0 && (
        <div className="mb-6">
          <NetWorthChart currentNet={netTotal} initialSnapshots={initialSnapshots} />
        </div>
      )}

      {/* AI insight band — replaces milestone bar */}
      <InsightBand />

      {/* Holdings list — 4 semantic categories */}
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
              total={group.total}
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

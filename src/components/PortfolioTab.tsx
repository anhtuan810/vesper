"use client";

import { useMemo, useState, useEffect } from "react";
import { NetWorthHero } from "@/components/NetWorthHero";
import {
  NetWorthChart,
  type SnapshotPoint,
  type Range,
  buildSeries,
} from "@/components/NetWorthChart";
import { InsightBand } from "@/components/InsightBand";
import { PositionRow } from "@/components/PositionRow";
import { HoldingsGroup } from "@/components/HoldingsGroup";
import { useSparklines } from "@/lib/hooks";
import { toUsdClient } from "@/lib/money";
import { computeCurrentBalance } from "@/lib/mortgage";
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

  const [range, setRange] = useState<Range>("1M");
  const [series, setSeries] = useState<SnapshotPoint[]>(
    initialSnapshots ? buildSeries(initialSnapshots, netTotal) : []
  );
  const [loading, setLoading] = useState(!initialSnapshots);
  const [selectedPoint, setSelectedPoint] = useState<SnapshotPoint | null>(null);

  // When dashboard-init finishes (potentially after a backfill), re-seed the 1M
  // series with real snapshot data. The initial /api/snapshots fetch may have
  // completed before the backfill ran, leaving an empty series.
  useEffect(() => {
    if (!initialSnapshots || range !== "1M") return;
    setSeries(buildSeries(initialSnapshots, netTotal));
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSnapshots]);

  useEffect(() => {
    if (range === "1M" && initialSnapshots) {
      // Re-seed from dashboard-init data; covers both the initial 1M load and
      // re-selection of "1M" after the user browsed another range.
      setSeries(buildSeries(initialSnapshots, netTotal));
      setLoading(false);
      return;
    }
    setLoading(true);
    setSelectedPoint(null);
    const controller = new AbortController();
    fetch(`/api/snapshots?range=${range}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((body) => {
        setSeries(buildSeries(body.data ?? [], netTotal));
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("Snapshots fetch failed:", err);
        setLoading(false);
      });
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, netTotal]);

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
        total: items.reduce((s, a) => {
          const equity = a.type === "real_estate" ? a.value - computeCurrentBalance(a) : a.value;
          return s + toUsdClient(equity, a.currency || "USD");
        }, 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [assets]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(ALL_CATEGORIES.map((c) => [c, true]))
  );

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("volnar.holdings.expanded");
      if (raw) {
        const keys: string[] = JSON.parse(raw);
        setExpanded(Object.fromEntries(ALL_CATEGORIES.map((c) => [c, keys.includes(c)])));
      }
    } catch {}
  }, []);

  const isExpanded = (cat: string) => expanded[cat] === true;
  const toggleGroup = (cat: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [cat]: !prev[cat] };
      try {
        const expandedKeys = Object.entries(next).filter(([, v]) => v).map(([k]) => k);
        sessionStorage.setItem("volnar.holdings.expanded", JSON.stringify(expandedKeys));
      } catch {}
      return next;
    });
  };

  return (
    <>
      {/* Hero + chart — constrained so the chart never stretches past a readable aspect ratio */}
      <div style={{ maxWidth: 660 }}>
        <div className="mb-5">
          <NetWorthHero netTotal={netTotal} range={range} selectedPoint={selectedPoint} series={series} />
        </div>

        {netTotal > 0 && (
          <div className="mb-6">
            <NetWorthChart
              range={range}
              onRangeChange={setRange}
              series={series}
              loading={loading}
              onSelectPoint={setSelectedPoint}
            />
          </div>
        )}
      </div>

      {/* AI insight band — replaces milestone bar */}
      {assets.length > 0 && <InsightBand />}

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
              barPct={netTotal > 0 ? Math.max((group.total / netTotal) * 100, 2) : 2}
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

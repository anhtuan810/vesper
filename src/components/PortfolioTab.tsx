"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { NetWorthHero } from "@/components/NetWorthHero";
import { NetWorthChart, type SnapshotPoint } from "@/components/NetWorthChart";
import { InsightBand } from "@/components/InsightBand";
import { PositionRow } from "@/components/PositionRow";
import { HoldingsGroup } from "@/components/HoldingsGroup";
import { PropertyMap } from "@/components/PropertyMap";
import { useSparklines, useTheme } from "@/lib/hooks";
import type { LiveAsset, RealEstateAsset } from "@/lib/supabase";

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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const MAX_CONCURRENT_WARM = 2;

export function PortfolioTab({
  assets, grossTotal, netTotal, initialSnapshots,
}: PortfolioTabProps) {
  const { resolvedTheme } = useTheme();
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

  // --- Thumbnail cache-warming machinery ---
  const [cacheVersions, setCacheVersions] = useState<Record<string, number>>({});
  const [warmQueue, setWarmQueue] = useState<RealEstateAsset[]>([]);
  const [activeWarmAssets, setActiveWarmAssets] = useState<RealEstateAsset[]>([]);

  const realEstateWithCoords = useMemo(
    () =>
      assets
        .filter((a) => a.type === "real_estate" && !!(a as RealEstateAsset).latitude)
        .map((a) => a as RealEstateAsset),
    [assets]
  );

  // One-time mount: HEAD-check each real-estate thumbnail; queue the missing ones.
  useEffect(() => {
    if (realEstateWithCoords.length === 0) return;
    let cancelled = false;

    Promise.all(
      realEstateWithCoords.map(async (asset) => {
        const url = `${SUPABASE_URL}/storage/v1/object/public/property-photos/${asset.user_id}/${asset.id}-${resolvedTheme}.png`;
        try {
          const r = await fetch(url, { method: "HEAD" });
          return r.ok ? null : asset;
        } catch {
          return asset;
        }
      })
    ).then((results) => {
      if (cancelled) return;
      const missing = results.filter((a): a is RealEstateAsset => a !== null);
      if (missing.length > 0) setWarmQueue(missing);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — single check on mount

  // Fill active slots (max 2) from the queue whenever either changes.
  useEffect(() => {
    if (activeWarmAssets.length >= MAX_CONCURRENT_WARM || warmQueue.length === 0) return;
    const slots = MAX_CONCURRENT_WARM - activeWarmAssets.length;
    const toStart = warmQueue.slice(0, slots);
    setWarmQueue(warmQueue.slice(toStart.length));
    setActiveWarmAssets([...activeWarmAssets, ...toStart]);
  }, [activeWarmAssets, warmQueue]);

  const handleWarmed = useCallback((assetId: string) => {
    setCacheVersions((prev) => ({ ...prev, [assetId]: (prev[assetId] ?? 0) + 1 }));
    setActiveWarmAssets((prev) => prev.filter((a) => a.id !== assetId));
  }, []);

  return (
    <>
      {/* Hidden PropertyMap renders for cache warming — offscreen, no pointer events */}
      {activeWarmAssets.map((asset) => (
        <div
          key={asset.id}
          style={{
            position: "fixed",
            top: -9999,
            left: -9999,
            width: 200,
            height: 200,
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          <PropertyMap asset={asset} onCached={() => handleWarmed(asset.id)} />
        </div>
      ))}

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
                  cacheVersion={cacheVersions[asset.id]}
                />
              ))}
            </HoldingsGroup>
          ))}
        </div>
      </div>
    </>
  );
}

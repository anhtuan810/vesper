"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NetWorthHero } from "@/components/NetWorthHero";
import {
  NetWorthChart,
  type SnapshotPoint,
  type Range,
  buildSeries,
} from "@/components/NetWorthChart";
import { InsightBand } from "@/components/InsightBand";
import { ProjectionTeaser } from "@/components/scenario/ProjectionTeaser";
import { PositionRow } from "@/components/PositionRow";
import { AssetLogo } from "@/components/AssetLogo";
import { HoldingsGroup } from "@/components/HoldingsGroup";
import { useSparklines, useDisplayCurrency } from "@/lib/hooks";
import { useIsDesktop } from "@/lib/hooks/useIsDesktop";
import { toUsdClient, formatMoney } from "@/lib/money";
import { computeCurrentBalance } from "@/lib/mortgage";
import { isIncomePension } from "@/lib/pension";
import { requestExplore } from "@/lib/scenario/explore";
import type { LiveAsset, Mutation } from "@/lib/supabase";
import { firstSnapshotDate } from "@/lib/networth-history";

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

// Fixed display order for the holdings groups — Crypto sits above Reserves
// (a deliberate semantic order, not value-ranked).
const CATEGORY_ORDER: Record<string, number> = {
  property: 0,
  markets:  1,
  crypto:   2,
  reserves: 3,
};

interface PortfolioTabProps {
  assets: LiveAsset[];
  grossTotal: number;
  netTotal: number;
  initialSnapshots?: SnapshotPoint[];
  valuesSettled: boolean;
  mutations: Mutation[];
}

export function PortfolioTab({
  assets, grossTotal, netTotal, initialSnapshots, valuesSettled, mutations,
}: PortfolioTabProps) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const displayCurrency = useDisplayCurrency();

  // Income pensions (db/state) are off-balance future income — they are kept out
  // of the four net-worth groups, the allocation bars, the position count, and
  // every total, and surfaced separately in the "Future income" section below.
  const netWorthAssets = useMemo(() => assets.filter((a) => !isIncomePension(a)), [assets]);
  const incomePensions = useMemo(() => assets.filter((a) => isIncomePension(a)), [assets]);

  // Open scenario explore in chat: desktop seeds the mounted panel in place,
  // mobile navigates to /chat (which reads the flag on mount).
  const handleExplore = () => {
    const handled = requestExplore(!!isDesktop);
    if (!handled) router.push("/chat");
  };

  const symbols = useMemo(
    () => netWorthAssets.map((a) => a.symbol).filter((s): s is string => !!s),
    [netWorthAssets]
  );
  const sparklines = useSparklines(symbols, "1W");

  const [range, setRange] = useState<Range>("1M");
  // Raw, DB-backed snapshot rows — kept separate from `series` (which always has
  // `buildSeries` append a synthesized "today" tip) so callers can tell "day one"
  // from "real history" by counting actual rows on distinct days.
  const [rawSnapshots, setRawSnapshots] = useState<SnapshotPoint[]>(initialSnapshots ?? []);
  const [series, setSeries] = useState<SnapshotPoint[]>(
    initialSnapshots ? buildSeries(initialSnapshots, netTotal) : []
  );
  const [loading, setLoading] = useState(!initialSnapshots);
  const [selectedPoint, setSelectedPoint] = useState<SnapshotPoint | null>(null);

  // Modeled (reconstructed, never-persisted) segment that precedes the first
  // live snapshot — fetched once; the chart decides per-range whether the
  // selected window reaches back far enough to show it.
  const [modeledSeries, setModeledSeries] = useState<SnapshotPoint[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/net-worth-history", { signal: controller.signal })
      .then((r) => r.json())
      .then((body) => setModeledSeries(body.modeled ?? []))
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("Modeled history fetch failed:", err);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setSelectedPoint(null);
    if (range === "1M") {
      // Use initialSnapshots when available; stay in loading state until they arrive.
      if (initialSnapshots) {
        setRawSnapshots(initialSnapshots);
        setSeries(buildSeries(initialSnapshots, netTotal));
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    fetch(`/api/snapshots?range=${range}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((body) => {
        const raw = body.data ?? [];
        setRawSnapshots(raw);
        setSeries(buildSeries(raw, netTotal));
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("Snapshots fetch failed:", err);
        setLoading(false);
      });
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, netTotal, initialSnapshots]);

  const trackingSinceDate = firstSnapshotDate(rawSnapshots);

  // Group by semantic category, ordered by the fixed CATEGORY_ORDER (Crypto above
  // Reserves); rows within a group still sort by value desc.
  const groups = useMemo(() => {
    const byCategory: Record<string, LiveAsset[]> = {};
    for (const a of netWorthAssets) {
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
      .sort((a, b) => (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99));
  }, [netWorthAssets]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    try {
      const raw = sessionStorage.getItem("volnar.holdings.collapsed");
      if (raw !== null) {
        const collapsed: string[] = JSON.parse(raw);
        return Object.fromEntries(ALL_CATEGORIES.map((c) => [c, !collapsed.includes(c)]));
      }
    } catch {}
    return Object.fromEntries(ALL_CATEGORIES.map((c) => [c, true]));
  });

  const isExpanded = (cat: string) => expanded[cat] === true;
  const toggleGroup = (cat: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [cat]: !prev[cat] };
      try {
        const collapsed = Object.entries(next).filter(([, v]) => !v).map(([k]) => k);
        sessionStorage.setItem("volnar.holdings.collapsed", JSON.stringify(collapsed));
      } catch {}
      return next;
    });
  };

  // Tapping the "Holdings" header collapses or expands every group at once: if
  // all currently-shown groups are expanded, collapse all; otherwise expand all.
  const allExpanded = groups.length > 0 && groups.every((g) => isExpanded(g.category));
  const toggleAll = () => {
    const next = !allExpanded;
    setExpanded((prev) => {
      const updated: Record<string, boolean> = { ...prev };
      for (const c of ALL_CATEGORIES) updated[c] = next;
      try {
        const collapsed = Object.entries(updated).filter(([, v]) => !v).map(([k]) => k);
        sessionStorage.setItem("volnar.holdings.collapsed", JSON.stringify(collapsed));
      } catch {}
      return updated;
    });
  };

  return (
    <>
      {/* Hero + chart — constrained so the chart never stretches past a readable aspect ratio.
          -mx-4 (mobile) bleeds left/right to cancel the page wrapper's px-4 so the hero number,
          chart and range pills sit flush with the full-bleed market/insight band edges. */}
      <div className="-mx-4 md:mx-0" style={{ maxWidth: 660 }}>
        <div className="mb-5">
          <NetWorthHero netTotal={netTotal} range={range} selectedPoint={selectedPoint} series={series} valuesSettled={valuesSettled} mutations={mutations} modeledSeries={modeledSeries} />
        </div>

        {netTotal > 0 && (
          <div className="mb-6">
            <NetWorthChart
              range={range}
              onRangeChange={setRange}
              series={series}
              loading={loading}
              onSelectPoint={setSelectedPoint}
              valuesSettled={valuesSettled}
              realPointCount={rawSnapshots.length}
              trackingSinceDate={trackingSinceDate}
              modeledSeries={modeledSeries}
            />
            {/* Ambient projection teaser — the single scenario entry: a quiet,
                left-aligned, trajectory-aware line under the chart. The sentence
                IS the affordance; tapping opens scenario explore (seeded with the
                deterministic portfolio scenario chips). */}
            <div style={{ marginTop: 10, paddingLeft: 4, paddingRight: 4 }}>
              <ProjectionTeaser onExplore={handleExplore} snapshots={rawSnapshots} />
            </div>
          </div>
        )}
      </div>

      {/* AI insight band — replaces milestone bar */}
      {assets.length > 0 && <InsightBand />}

      {/* Holdings list — 4 semantic categories.
          Mobile: bleed to the band edge with no inner padding (md:px-4 only) so
          the group headers and rows sit flush at the same left/right column as
          the hero and the full-bleed market band. Desktop keeps the 16px inset. */}
      <div className="-mx-4 md:-mx-8 md:px-4">
        <div
          className="flex items-baseline justify-between mb-3"
          onClick={toggleAll}
          role="button"
          tabIndex={0}
          aria-expanded={allExpanded}
          aria-label={allExpanded ? "Collapse all holdings" : "Expand all holdings"}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleAll(); } }}
          style={{ cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
        >
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
            {netWorthAssets.length} {netWorthAssets.length === 1 ? "position" : "positions"}
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
                  valuesSettled={valuesSettled}
                />
              ))}
            </HoldingsGroup>
          ))}
        </div>

        {/* Future income — income pensions (db/state). Off-balance: shown below
            the net-worth holdings, never added to any total or the allocation. */}
        {incomePensions.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div className="flex items-baseline justify-between" style={{ marginBottom: 4 }}>
              <div
                className="font-serif"
                style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--text)", fontVariationSettings: "'opsz' 24" }}
              >
                Future income
              </div>
              <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
                {formatMoney(
                  incomePensions.reduce((s, a) => s + toUsdClient((a as { annual_income?: number | null }).annual_income ?? 0, a.currency || "USD"), 0),
                  "USD",
                  displayCurrency,
                )} / year
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 12, lineHeight: 1.45 }}>
              Not part of net worth — future income you&apos;ll receive, not a holding you own today.
            </div>
            {/* Each pension renders as an INDIVIDUAL asset row — same element,
                classes, logo and typography as PositionRow (15px/500 name, 32px
                AssetLogo, 13px/500 tabular value, 9px row padding, border-strong
                divider) — so it reads as one asset, lighter than the category
                rows. Value is the annual income, not a net-worth figure. */}
            <div>
              {incomePensions.map((a) => (
                <Link key={a.id} href={`/asset/${a.id}`} className="block">
                  <div
                    className="flex items-center border-b border-border-strong last:border-0 gap-3"
                    style={{ paddingTop: 9, paddingBottom: 9 }}
                  >
                    <AssetLogo type={a.type} symbol={a.symbol ?? null} name={a.name} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="text-fg leading-snug truncate" style={{ fontSize: 15, fontWeight: 500 }}>
                        {a.name}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-fg" style={{ fontSize: 13, fontWeight: 500, fontFeatureSettings: '"tnum" 1' }}>
                        {formatMoney(toUsdClient((a as { annual_income?: number | null }).annual_income ?? 0, a.currency || "USD"), "USD", displayCurrency)} / year
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

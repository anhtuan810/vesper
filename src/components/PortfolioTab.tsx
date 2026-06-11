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
  rangeStartDate,
  convertPointToDisplay,
  buildLiveRates,
} from "@/components/NetWorthChart";
import { PortfolioSummaryCard } from "@/components/PortfolioSummaryCard";
import { PositionRow } from "@/components/PositionRow";
import { AssetLogo } from "@/components/AssetLogo";
import { HoldingsGroup } from "@/components/HoldingsGroup";
import { useSparklines, useDisplayCurrency } from "@/lib/hooks";
import { useIsDesktop } from "@/lib/hooks/useIsDesktop";
import { toDisplay, formatMoney } from "@/lib/money";
import { computeCurrentBalance } from "@/lib/mortgage";
import { isIncomePension } from "@/lib/pension";
import { requestExplore } from "@/lib/scenario/explore";
import type { LiveAsset, Mutation } from "@/lib/supabase";
import type { MarketHighlight } from "@/lib/market-highlights";
import { firstSnapshotDate } from "@/lib/networth-history";
import {
  CATEGORY_MAP, CATEGORY_LABEL, CATEGORY_COLOR, CATEGORY_ORDER, ALL_CATEGORIES,
} from "@/lib/categories";

// Clips the FULL snapshot history to a range's display window: every real row
// at or after `windowStart`, plus the single most recent row strictly BEFORE
// it as a left anchor — so the line always starts at the window edge and a
// bounded range never collapses to fewer than 2 points whenever the full
// history actually spans it (sparse monthly-cadence history still draws a
// continuous clipped line). "All" has no window start — pass the full series.
function clipToRange(full: SnapshotPoint[], range: Range): SnapshotPoint[] {
  const windowStart = rangeStartDate(range);
  if (windowStart == null) return full;
  let anchor: SnapshotPoint | null = null;
  const within: SnapshotPoint[] = [];
  for (const p of full) {
    if (p.date < windowStart) anchor = p;
    else within.push(p);
  }
  return anchor ? [anchor, ...within] : within;
}

interface PortfolioTabProps {
  assets: LiveAsset[];
  grossTotal: number;
  netTotal: number;
  initialSnapshots?: SnapshotPoint[];
  valuesSettled: boolean;
  mutations: Mutation[];
  marketHighlights: MarketHighlight[];
}

export function PortfolioTab({
  assets, grossTotal, netTotal, initialSnapshots, valuesSettled, mutations, marketHighlights,
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
  // The FULL DB-backed snapshot history (range=All) — fetched once and kept as
  // the single authority for data extent. Coverage (`trackingSinceDate`), the
  // marker decision, and pill-disable all derive from this, never from a
  // range-clipped slice — otherwise a bounded window's own narrowness gets
  // mistaken for "this account has no real history before this point".
  const [fullSnapshots, setFullSnapshots] = useState<SnapshotPoint[]>(initialSnapshots ?? []);
  const [loading, setLoading] = useState(!initialSnapshots);
  const [selectedPoint, setSelectedPoint] = useState<SnapshotPoint | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/snapshots?range=All`, { signal: controller.signal })
      .then((r) => r.json())
      .then((body) => {
        setFullSnapshots(body.data ?? []);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("Snapshots fetch failed:", err);
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setSelectedPoint(null);
  }, [range]);

  // Live per-asset-type breakdown (display currency) for the synthesized
  // "today" tip — same equity valuation as netTotal (page.tsx) and the
  // Holdings groups below, just bucketed by asset type instead of summed into
  // one number, so categoryBreakdown's CATEGORY_MAP folding reflects today's
  // actual (post-add/remove) composition.
  const todayBreakdown = useMemo(() => {
    const result: Record<string, number> = {};
    for (const a of netWorthAssets) {
      const equity = a.type === "real_estate"
        ? Math.max(0, a.value - computeCurrentBalance(a))
        : a.value;
      const inDisplay = toDisplay(equity, a.currency || "USD", displayCurrency);
      if (inDisplay == null) continue;
      result[a.type] = (result[a.type] ?? 0) + inDisplay;
    }
    return result;
  }, [netWorthAssets, displayCurrency]);

  // Display series — the full history clipped to the selected range's window
  // (plus a left anchor so the line never collapses below 2 points), with
  // `buildSeries` appending the synthesized "today" tip.
  const series = useMemo(
    () => buildSeries(clipToRange(fullSnapshots, range), netTotal, todayBreakdown),
    [fullSnapshots, range, netTotal, todayBreakdown]
  );

  // Hero/baseline series — converted to the display currency the same way the
  // chart converts its plotted points (native_breakdown direct, live-rate
  // fallback), so the hero number and chart agree exactly.
  const heroSeries = useMemo(() => {
    const liveRates = buildLiveRates();
    return series.map((p) => ({ ...p, total_value: convertPointToDisplay(p, displayCurrency, liveRates) }));
  }, [series, displayCurrency]);

  const trackingSinceDate = firstSnapshotDate(fullSnapshots);

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
          const inDisplay = toDisplay(equity, a.currency || "USD", displayCurrency);
          return s + (inDisplay ?? 0);
        }, 0),
      }))
      .sort((a, b) => (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99));
  }, [netWorthAssets, displayCurrency]);

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
          <NetWorthHero netTotal={netTotal} range={range} selectedPoint={selectedPoint} series={heroSeries} valuesSettled={valuesSettled} mutations={mutations} />
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
              realPointCount={fullSnapshots.length}
              trackingSinceDate={trackingSinceDate}
            />
          </div>
        )}
      </div>

      {/* Portfolio summary — three flat, hairline-separated sections (Projection,
          Worth knowing, Markets), no card container. Same horizontal bounds as
          the hero+chart block above (-mx-4 md:mx-0, maxWidth 660) so the section
          edges line up with the net-worth number and the Holdings header. */}
      {assets.length > 0 && (
        <div className="-mx-4 md:mx-0 mb-6" style={{ maxWidth: 660 }}>
          <PortfolioSummaryCard
            netTotal={netTotal}
            snapshots={fullSnapshots}
            marketHighlights={marketHighlights}
            onExplore={handleExplore}
          />
        </div>
      )}

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
                  incomePensions.reduce((s, a) => {
                    const native = (a as { annual_income?: number | null }).annual_income ?? 0;
                    return s + (toDisplay(native, a.currency || "USD", displayCurrency) ?? 0);
                  }, 0),
                  displayCurrency,
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
                        {formatMoney((a as { annual_income?: number | null }).annual_income ?? 0, a.currency || "USD", displayCurrency)} / year
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

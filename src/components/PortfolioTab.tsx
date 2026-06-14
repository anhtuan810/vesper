"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import { apiFetch } from "@/lib/api";

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

// Per-device persisted order for the Holdings category groups (localStorage,
// not synced across devices — see NON-GOALS).
const HOLDINGS_ORDER_KEY = "volnar:holdings-order";
function loadHoldingsOrder(): string[] {
  try { const raw = localStorage.getItem(HOLDINGS_ORDER_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
// Saved order first (only still-present categories), then any new ones by
// CATEGORY_ORDER — so a removed category drops out cleanly and a freshly-added
// one appends in its canonical slot without clobbering the user's arrangement.
function reconcileOrder(saved: string[], present: string[]): string[] {
  const kept = saved.filter((c) => present.includes(c));
  const rest = present.filter((c) => !kept.includes(c))
    .sort((a, b) => (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99));
  return [...kept, ...rest];
}

// Sortable wrapper around HoldingsGroup — owns the dnd-kit node/transform and
// injects a grip handle (the drag activator) left of the header. The handle is
// the only activator, so tapping the header still toggles expand/collapse.
function SortableHoldingsGroup({ category, children, ...groupProps }:
  { category: string; children: React.ReactNode } & React.ComponentProps<typeof HoldingsGroup>) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: category });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: "relative",
    zIndex: isDragging ? 5 : undefined,
    background: isDragging ? "var(--surface)" : undefined,
    boxShadow: isDragging ? "0 6px 20px rgba(0,0,0,0.10)" : undefined,
  };
  const handle = (
    <span ref={setActivatorNodeRef} {...attributes} {...listeners}
      role="button" tabIndex={0} aria-label="Reorder category"
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 24, height: 24, marginRight: 4, flexShrink: 0,
        cursor: "grab", touchAction: "none", color: "var(--text-faint)", opacity: 0.5 }}>
      <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
        <circle cx="2" cy="3" r="1.3"/><circle cx="8" cy="3" r="1.3"/>
        <circle cx="2" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/>
        <circle cx="2" cy="13" r="1.3"/><circle cx="8" cy="13" r="1.3"/>
      </svg>
    </span>
  );
  return (
    <div ref={setNodeRef} style={style}>
      <HoldingsGroup {...groupProps} dragHandle={handle}>{children}</HoldingsGroup>
    </div>
  );
}

// "Liquid only" view — combined public-markets + crypto. These types are
// unlevered, so display value == value (no mortgage/equity-floor logic).
// Property, cash, pension, bonds and gold are excluded.
const LIQUID_TYPES = ["stocks", "etf", "crypto"];
const LIQUID_ONLY_KEY = "volnar:liquid-only";

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
    apiFetch(`/api/snapshots?range=All`, { signal: controller.signal })
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

  // "Liquid only" toggle — per-device (sessionStorage). Loaded on mount (kept
  // out of the initializer to avoid touching sessionStorage during SSR).
  const [liquidOnly, setLiquidOnly] = useState(false);
  useEffect(() => {
    try { setLiquidOnly(sessionStorage.getItem(LIQUID_ONLY_KEY) === "true"); } catch {}
  }, []);
  const toggleLiquid = () => {
    setLiquidOnly((prev) => {
      const next = !prev;
      try { sessionStorage.setItem(LIQUID_ONLY_KEY, String(next)); } catch {}
      return next;
    });
  };

  // Combined liquid value (display currency) — stocks + ETF + crypto. Same
  // conversion as netTotal/the Holdings groups; unlevered so value == display.
  const liquidTotal = useMemo(() => {
    let sum = 0;
    for (const a of netWorthAssets) {
      if (!LIQUID_TYPES.includes(a.type)) continue;
      sum += toDisplay(a.value, a.currency || "USD", displayCurrency) ?? 0;
    }
    return sum;
  }, [netWorthAssets, displayCurrency]);

  // Liquid line series — each historical point's liquid USD sum
  // (breakdown.stocks+etf+crypto) converted to the display currency at the live
  // rate. FX is held flat for this phase: historical points use today's rate,
  // an accepted, documented trade-off (the per-currency native_breakdown the
  // full series carries isn't available per asset-type). total_value is the
  // display value; native_breakdown is tagged with the display currency so
  // NetWorthChart's per-point conversion is an identity — otherwise it treats
  // total_value as USD and double-converts. The live "today" tip carries
  // liquidTotal.
  const liquidSeries = useMemo<SnapshotPoint[]>(() => {
    const today = new Date().toISOString().slice(0, 10);
    const out: SnapshotPoint[] = [];
    for (const p of clipToRange(fullSnapshots, range)) {
      if (p.date === today) continue;
      const usd = (p.breakdown?.stocks ?? 0) + (p.breakdown?.etf ?? 0) + (p.breakdown?.crypto ?? 0);
      const value = toDisplay(usd, "USD", displayCurrency) ?? usd;
      out.push({ date: p.date, total_value: value, native_breakdown: { [displayCurrency]: value } });
    }
    out.push({ date: today, total_value: liquidTotal });
    return out;
  }, [fullSnapshots, range, displayCurrency, liquidTotal]);

  // Active total/series for the hero + chart — swapped to the liquid view when
  // the toggle is on; otherwise byte-for-byte the existing net-worth values.
  const heroTotal = liquidOnly ? liquidTotal : netTotal;
  const heroSeriesActive = liquidOnly ? liquidSeries : heroSeries;
  const chartSeriesActive = liquidOnly ? liquidSeries : series;

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
          // Equity floored at 0 for real estate — matches netTotal (page.tsx) and
          // todayBreakdown, so an underwater property can't push a group total
          // (or its allocation bar) negative while the hero net worth floors at 0.
          const equity = a.type === "real_estate" ? Math.max(0, a.value - computeCurrentBalance(a)) : a.value;
          const inDisplay = toDisplay(equity, a.currency || "USD", displayCurrency);
          return s + (inDisplay ?? 0);
        }, 0),
      }))
      .sort((a, b) => (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99));
  }, [netWorthAssets, displayCurrency]);

  // User's drag-reordered category sequence (per-device). Empty until the
  // mount-only load below — keeping it out of the initializer avoids touching
  // localStorage during SSR.
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => { setOrder(loadHoldingsOrder()); }, []);

  // The value-sorted `groups` re-sequenced by the saved order; new categories
  // append by CATEGORY_ORDER and removed ones drop out (reconcileOrder).
  const orderedGroups = useMemo(() => {
    const present = groups.map((g) => g.category);
    const seq = reconcileOrder(order, present);
    const byCat = new Map(groups.map((g) => [g.category, g]));
    return seq.map((c) => byCat.get(c)).filter(Boolean) as typeof groups;
  }, [groups, order]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const present = orderedGroups.map((g) => g.category);
    const next = arrayMove(present, present.indexOf(active.id as string), present.indexOf(over.id as string));
    setOrder(next);
    try { localStorage.setItem(HOLDINGS_ORDER_KEY, JSON.stringify(next)); } catch {}
  }

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
          <NetWorthHero netTotal={heroTotal} range={range} selectedPoint={selectedPoint} series={heroSeriesActive} valuesSettled={valuesSettled} mutations={mutations} liquidOnly={liquidOnly} onToggleLiquid={toggleLiquid} />
        </div>

        {heroTotal > 0 && (
          <div className="mb-2">
            <NetWorthChart
              range={range}
              onRangeChange={setRange}
              series={chartSeriesActive}
              loading={loading}
              onSelectPoint={setSelectedPoint}
              valuesSettled={valuesSettled}
              realPointCount={fullSnapshots.length}
              trackingSinceDate={trackingSinceDate}
              lineOnly={liquidOnly}
            />
          </div>
        )}
      </div>

      {/* Portfolio summary — three compact rows (Projection, Worth knowing,
          Markets) held in one contained card. Bleeds to the same width as the
          hero/chart and Holdings (-mx-4 md:mx-0) so the card's edges line up
          with the net-worth number and the Holdings header instead of sitting
          inset/indented. The card's own surface + border keeps it from floating. */}
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
        {/* Demoted from a 26px serif title to the app's small uppercase
            section-label idiom (PERSPECTIVE / INDICATIVE VALUE) — the category
            rows below self-describe, so the header only needs to carry the
            position count and the collapse/expand-all tap affordance. */}
        <div
          onClick={toggleAll}
          role="button"
          tabIndex={0}
          aria-expanded={allExpanded}
          aria-label={allExpanded ? "Collapse all holdings" : "Expand all holdings"}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleAll(); } }}
          style={{
            cursor: "pointer", WebkitTapHighlightColor: "transparent",
            padding: "8px 0", marginBottom: 2,
            fontSize: 10, fontWeight: 500, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "var(--text-faint)",
          }}
        >
          Holdings · {netWorthAssets.length} {netWorthAssets.length === 1 ? "position" : "positions"}
        </div>
        <div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedGroups.map((g) => g.category)} strategy={verticalListSortingStrategy}>
              {orderedGroups.map((group) => (
                <SortableHoldingsGroup
                  key={group.category}
                  category={group.category}
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
                </SortableHoldingsGroup>
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {/* Future income — income pensions (db/state). Off-balance: shown below
            the net-worth holdings, never added to any total or the allocation. */}
        {incomePensions.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div className="flex items-baseline justify-between" style={{ marginBottom: 6 }}>
              <div
                style={{
                  fontSize: 10, fontWeight: 500, letterSpacing: "0.18em",
                  textTransform: "uppercase", color: "var(--text-faint)",
                }}
              >
                Future income
              </div>
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
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
                <Link key={a.id} href={`/asset?id=${a.id}`} className="block">
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

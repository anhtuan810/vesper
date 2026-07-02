"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { NetWorthHero } from "@/components/NetWorthHero";
import type { HoldingAt } from "@/lib/snapshot";
import {
  NetWorthChart,
  type SnapshotPoint,
  type Range,
  buildSeries,
  rangeStartDate,
  convertPointToDisplay,
  buildLiveRates,
} from "@/components/NetWorthChart";
import { MobileDecisionJournal, notableDecisions, decisionTitle, mDate, shortDate } from "@/components/MobileDecisionJournal";
import { PositionRow } from "@/components/PositionRow";
import { AssetLogo } from "@/components/AssetLogo";
import { HoldingsGroup } from "@/components/HoldingsGroup";
import { useSparklines, useDisplayCurrency, useLiquidIntraday } from "@/lib/hooks";
import { toDisplay, formatMoney } from "@/lib/money";
import { computeCurrentBalance } from "@/lib/mortgage";
import { isIncomePension } from "@/lib/pension";
import type { LiveAsset, Mutation } from "@/lib/supabase";
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

// "Liquid only" view — combined public-markets + crypto. These types are
// unlevered, so display value == value (no mortgage/equity-floor logic).
// Property, cash, pension, bonds and gold are excluded.
const LIQUID_TYPES = ["stocks", "etf", "crypto"];
const LIQUID_ONLY_KEY = "volnar:liquid-only";

// Unit count for a rewound tradeable row — nl-NL grouping, up to 4 decimals
// (crypto fractions stay readable, whole share counts stay clean).
const fmtUnits = (u: number) => new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 4 }).format(u);

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
  const displayCurrency = useDisplayCurrency();

  // Income pensions (db/state) are off-balance future income — they are kept out
  // of the four net-worth groups, the allocation bars, the position count, and
  // every total, and surfaced separately in the "Future income" section below.
  const netWorthAssets = useMemo(() => assets.filter((a) => !isIncomePension(a)), [assets]);
  const incomePensions = useMemo(() => assets.filter((a) => isIncomePension(a)), [assets]);

  const symbols = useMemo(
    () => netWorthAssets.map((a) => a.symbol).filter((s): s is string => !!s),
    [netWorthAssets]
  );
  const sparklines = useSparklines(symbols, "1W");

  // Default to the full history ("All") so the Overview opens on the complete
  // arc — the same lens the desktop leads with.
  const [range, setRange] = useState<Range>("All");
  // The FULL DB-backed snapshot history (range=All) — fetched once and kept as
  // the single authority for data extent. Coverage (`trackingSinceDate`), the
  // marker decision, and pill-disable all derive from this, never from a
  // range-clipped slice — otherwise a bounded window's own narrowness gets
  // mistaken for "this account has no real history before this point".
  const [fullSnapshots, setFullSnapshots] = useState<SnapshotPoint[]>(initialSnapshots ?? []);
  const [loading, setLoading] = useState(!initialSnapshots);
  // The decision selected on the chart / in the journal (shared between the two,
  // mirroring the desktop). null → default to the newest in-range decision.
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);
  // The point under a HELD scrub — the chart emits it while the finger is down
  // and null on release, so the hero readout is transient by construction.
  const [scrubPoint, setScrubPoint] = useState<SnapshotPoint | null>(null);
  // A parked NAMED rewind: tapping a decision dot stands the whole page — hero
  // number AND holdings list — at that entry's day. Only a dot tap can set it
  // (anonymous points on the line can be read via scrub but never parked); it
  // clears via "Back to today", a range switch, the Liquid lens, or leaving
  // the tab. `date` is the entry's YYYY-MM-DD day.
  const [rewind, setRewind] = useState<{ id: string; date: string } | null>(null);
  // As-of-date books already reconstructed this session, keyed by date — a
  // past day's book never changes under the user's feet, so re-tapping a dot
  // must not refetch. This doubles as the fetch guard.
  const [holdingsByDate, setHoldingsByDate] = useState<Record<string, HoldingAt[]>>({});

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
    setSelectedDecisionId(null);
    setRewind(null);
  }, [range]);

  // Fetch the reconstructed book for the rewound date (once per date per
  // session — `holdingsByDate` is both the cache and the guard). On failure,
  // fall back to today rather than leaving the hero stuck on a skeleton.
  useEffect(() => {
    if (!rewind || holdingsByDate[rewind.date]) return;
    const date = rewind.date;
    const controller = new AbortController();
    apiFetch(`/api/holdings-at?date=${date}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`holdings-at ${r.status}`);
        return r.json();
      })
      .then((body) => {
        setHoldingsByDate((prev) => ({ ...prev, [date]: body.data ?? [] }));
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("Holdings-at fetch failed:", err);
        setRewind((cur) => (cur?.date === date ? null : cur));
      });
    return () => controller.abort();
  }, [rewind, holdingsByDate]);

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
  const setLiquid = (v: boolean) => {
    setLiquidOnly(v);
    // The rewound book is the full net worth — it has no liquid lens, so
    // switching lenses returns to today first.
    if (v) setRewind(null);
    try { sessionStorage.setItem(LIQUID_ONLY_KEY, String(v)); } catch {}
    // 1D is liquid-only; leaving the liquid view drops back to the default window.
    if (!v && range === "1D") setRange("All");
  };

  // Per-asset liquid display values (display currency) — stocks + ETF + crypto,
  // unlevered so value == display. Single source of truth reused by both the
  // liquid total and the intraday ratio model (no second valuation path).
  const liquidAssets = useMemo(
    () => netWorthAssets
      .filter((a) => LIQUID_TYPES.includes(a.type))
      .map((a) => ({
        id: a.id,
        displayValue: toDisplay(a.value, a.currency || "USD", displayCurrency) ?? 0,
      })),
    [netWorthAssets, displayCurrency],
  );
  const liquidTotal = useMemo(
    () => liquidAssets.reduce((s, a) => s + a.displayValue, 0),
    [liquidAssets],
  );

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

  // Intraday 5m bars for the liquid set — only fetched in the Liquid-only 1D view.
  const isIntraday = liquidOnly && range === "1D";
  const { data: intraday, isLoading: intradayLoading } = useLiquidIntraday(isIntraday);

  // Intraday combined line (display currency) via the ratio model:
  //   value_a(t) = currentDisplayValue(a) × close_a(t) / close_a(latest)
  // The grid is the ET trading day: windowStart (yesterday's close, the line's
  // left edge) plus the union of each asset's today bars. Each asset is
  // forward-filled to the grid, holding its day-open close before its first bar
  // (so a stock sits flat at the previous close until its 9:30 ET open, baking
  // in the overnight gap). Assets that didn't trade today contribute a flat
  // current value, so the last grid point equals the live liquid total
  // (continuity). The ratio is unitless, so FX is held flat automatically;
  // native_breakdown is tagged with the display currency so NetWorthChart's
  // per-point conversion stays an identity. Empty until the fetch returns.
  const intradaySeries = useMemo<SnapshotPoint[]>(() => {
    if (!intraday || intraday.assets.length === 0) return [];
    const byId = new Map(intraday.assets.map((a) => [a.id, { closes: [...a.closes].sort((x, y) => x.t - y.t), dayOpen: a.dayOpen }]));
    const tsSet = new Set<number>();
    if (intraday.windowStart) tsSet.add(intraday.windowStart);
    for (const a of intraday.assets) for (const c of a.closes) tsSet.add(c.t);
    const grid = [...tsSet].sort((x, y) => x - y);
    if (grid.length < 2) return [];

    const totals = new Array<number>(grid.length).fill(0);
    for (const a of liquidAssets) {
      const entry = byId.get(a.id);
      const denom = entry && entry.closes.length > 0 ? entry.closes[entry.closes.length - 1].close : 0;
      if (!entry || !denom) {
        // Didn't trade today (e.g. a stock on a weekend) → flat current value.
        for (let i = 0; i < grid.length; i++) totals[i] += a.displayValue;
        continue;
      }
      const { closes, dayOpen } = entry;
      let j = 0;
      let cur = dayOpen || closes[0].close; // before the first bar, hold the day-open
      for (let i = 0; i < grid.length; i++) {
        while (j < closes.length && closes[j].t <= grid[i]) { cur = closes[j].close; j++; }
        totals[i] += a.displayValue * (cur / denom);
      }
    }
    return grid.map((t, i) => ({
      date: new Date(t * 1000).toISOString(),
      total_value: totals[i],
      native_breakdown: { [displayCurrency]: totals[i] },
    }));
  }, [intraday, liquidAssets, displayCurrency]);

  // Active total/series for the hero + chart. Liquid-only 1D → intraday combined
  // line (netTotal stays the live liquid total for continuity); liquid daily →
  // Phase B series; net worth → unchanged.
  const heroTotal = liquidOnly ? liquidTotal : netTotal;
  const heroSeriesActive = !liquidOnly ? heroSeries : isIntraday ? intradaySeries : liquidSeries;
  const chartSeriesActive = !liquidOnly ? series : isIntraday ? intradaySeries : liquidSeries;

  const trackingSinceDate = firstSnapshotDate(fullSnapshots);

  // Decision markers for the chart — the notable decisions (buys/sells/trims),
  // scoped to the visible range, the same set the journal steps through. Tapping
  // a dot selects it; stepping the journal moves the dot. Shown on the Net worth
  // line and the Liquid line alike; only the intraday (Liquid · 1D) view drops
  // them, since its axis is hours-of-today and calendar-date dots can't map onto
  // it. Mirrors the desktop Overview's journal-dot chart.
  const journalDecisions = useMemo(() => notableDecisions(mutations), [mutations]);
  const navDecisions = useMemo(() => {
    // Bound by the chart's actual first plotted point (which includes clipToRange's
    // left anchor), not rangeStartDate — so every stepper entry has a dot on the
    // line and the journal count matches the dots exactly.
    const start = series[0]?.date ?? rangeStartDate(range);
    return start ? journalDecisions.filter((d) => mDate(d).slice(0, 10) >= start) : journalDecisions;
  }, [journalDecisions, series, range]);
  const markers = useMemo(
    () => navDecisions.map((d) => ({ id: d.id, date: mDate(d).slice(0, 10), kind: "you" as const, title: decisionTitle(d), sub: shortDate(mDate(d)) })),
    [navDecisions],
  );
  // Fall back to the newest in-range decision whenever the selected id isn't in
  // the current set (range narrowed, or `mutations` revalidated out from under
  // it) — keeps the chart highlight and the journal panel agreeing on one entry.
  const activeMarkerId =
    selectedDecisionId && navDecisions.some((d) => d.id === selectedDecisionId)
      ? selectedDecisionId
      : navDecisions[0]?.id ?? null;

  // Tapping a decision dot selects the journal entry AND parks the rewind at
  // its day — the user said what moment they mean, so the hero and the
  // holdings below both stand there. A today-dated entry has nothing to
  // reconstruct (the live page IS that day), and the Liquid lens shows a
  // subset the full-book rewind doesn't speak for — both just select.
  const onMarkerClick = (id: string) => {
    setSelectedDecisionId(id);
    const d = navDecisions.find((x) => x.id === id);
    if (!d || liquidOnly) return;
    const day = mDate(d).slice(0, 10);
    if (day < new Date().toISOString().slice(0, 10)) setRewind({ id, date: day });
  };

  // The rewound book, ready to render: per-row display values, category groups
  // with totals, and the grand total the hero shows — summed from the SAME
  // rows the list renders, so the two can never disagree. A row whose value
  // couldn't be established (no price record for that day, or no usable FX
  // rate) is listed with a dash and makes the total approximate — honest and
  // visible, never silently guessed. null while the reconstruction loads.
  const rewindBook = useMemo(() => {
    const holdings = rewind ? holdingsByDate[rewind.date] : undefined;
    if (!rewind || !holdings) return null;
    const rows = holdings.map((h) => ({
      ...h,
      displayValue: h.value != null ? toDisplay(h.value, h.currency || "USD", displayCurrency) : null,
    }));
    const byCategory: Record<string, typeof rows> = {};
    for (const r of rows) {
      const cat = CATEGORY_MAP[r.type] ?? "reserves";
      (byCategory[cat] ??= []).push(r);
    }
    const groups = Object.entries(byCategory)
      .map(([cat, items]) => ({
        category: cat,
        label: CATEGORY_LABEL[cat] ?? cat,
        items: [...items].sort((a, b) => (b.displayValue ?? -1) - (a.displayValue ?? -1)),
        total: items.reduce((s, r) => s + (r.displayValue ?? 0), 0),
      }))
      .sort((a, b) => (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99));
    return {
      groups,
      total: rows.reduce((s, r) => s + (r.displayValue ?? 0), 0),
      approx: rows.some((r) => r.displayValue == null),
      count: rows.length,
    };
  }, [rewind, holdingsByDate, displayCurrency]);

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
          -mx-5 (mobile) bleeds left/right to cancel the page wrapper's px-5 (20px) so the hero
          number, chart and range pills sit flush with the full-bleed market/insight band edges. */}
      <div style={{ maxWidth: 660 }}>
        <div className="mb-5">
          <NetWorthHero
            netTotal={heroTotal}
            range={range}
            series={heroSeriesActive}
            valuesSettled={valuesSettled}
            mutations={mutations}
            liquidOnly={liquidOnly}
            onSetLiquid={setLiquid}
            scrubPoint={scrubPoint}
            rewind={rewind ? { date: rewind.date, total: rewindBook?.total ?? null, approx: rewindBook?.approx ?? false } : null}
            onExitRewind={() => setRewind(null)}
          />
        </div>

        {heroTotal > 0 && (
          <div className="mb-2">
            <NetWorthChart
              range={range}
              onRangeChange={setRange}
              series={chartSeriesActive}
              loading={isIntraday ? intradayLoading : loading}
              onSelectPoint={setScrubPoint}
              valuesSettled={valuesSettled}
              realPointCount={fullSnapshots.length}
              trackingSinceDate={trackingSinceDate}
              lineOnly={liquidOnly}
              liquidOnly={liquidOnly}
              markers={isIntraday ? undefined : markers}
              selectedMarkerId={activeMarkerId}
              onMarkerClick={onMarkerClick}
            />
          </div>
        )}
      </div>

      {/* Decision journal — the latest (or chart-selected) decision as a folding
          entry. Shown in BOTH the Net worth and Liquid lenses: the diary is
          portfolio-wide narrative, not tied to which line is on screen. The chart
          decision dots stay off in the Liquid view (their date axis doesn't map
          onto the intraday liquid series), so there the entry simply defaults to
          the newest decision. Its "journal" feel comes from the book mark, the
          mono dateline, the upright-serif reflection and — once unfolded — the
          perforation into the "Looking back" verdict (MobileDecisionJournal).
          Content-first: no card — a hairline rule and whitespace part it from the
          chart above, and its text sits flush with the hero. */}
      <div style={{ maxWidth: 660, marginTop: "var(--space-5)", paddingTop: "var(--space-5)", borderTop: "1px solid var(--border)" }}>
        {navDecisions.length > 0 ? (
          <MobileDecisionJournal
            decisions={navDecisions}
            selectedId={selectedDecisionId}
            displayCurrency={displayCurrency}
          />
        ) : (
          // No logged decisions yet — keep the zone visible and explain it fills
          // in once there's data, rather than leaving a blank gap. Lead with the
          // same book glyph so it still reads as the journal.
          <>
            <svg width="15" height="15" viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ color: "var(--accent-text)", display: "block", marginBottom: "var(--space-2)" }}>
              <path d="M128,88a31.79,31.79,0,0,1,24-24h78a2,2,0,0,1,2,2V194.86a2,2,0,0,1-2.4,2A40,40,0,0,0,224,196H160a32,32,0,0,0-32,32" />
              <path d="M26,196.83V65.91a2,2,0,0,1,2-2h76a32,32,0,0,1,24,24V228a32,32,0,0,0-32-32H32A6,6,0,0,1,26,196.83Z" />
            </svg>
            <p style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: "var(--fs-body)", color: "var(--text-dim)", lineHeight: "var(--lh-body)", margin: 0 }}>
              Your decisions will appear here once you log them — each one pinned to a point on the line, with a look back after it&rsquo;s had time to play out.
            </p>
          </>
        )}
      </div>

      {/* Holdings. Rewound: the list stands at the tapped entry's day — dated
          header, every group open, each row valued at that day's prices from
          the same reconstruction the hero total is summed from. This is the
          "what did I own, and why did I decide that?" view: the entry above
          says why, this list says what. Live: content-first, no "Holdings"
          title — a quiet meta line (the position count + a global
          expand/collapse-all) sits at the top of the block, under the hairline
          rule that parts it from the journal; the category groups follow,
          leading with Property. */}
      {rewind ? (
        <div>
          <div className="flex items-center justify-between" style={{ marginTop: "var(--space-5)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--border)", marginBottom: "var(--space-2)" }}>
            <span className="eyebrow" style={{ color: "var(--text-faint)" }}>
              Holdings · {shortDate(rewind.date)}
            </span>
            <button
              onClick={() => setRewind(null)}
              className="font-ui"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "var(--fs-micro)", letterSpacing: "0.04em", color: "var(--accent-text)", whiteSpace: "nowrap" }}
            >
              ← Back to today
            </button>
          </div>
          <div style={{ fontSize: "var(--fs-caption)", color: "var(--text-faint)", marginBottom: "var(--space-3)", lineHeight: "var(--lh-body)" }}>
            What you owned on this day, valued at that day&apos;s prices — reconstructed from your records.
          </div>
          {rewindBook == null ? (
            <div style={{ display: "grid", gap: "var(--space-2)" }}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="bg-surface-elev rounded-lg animate-pulse" style={{ height: 48 }} />
              ))}
            </div>
          ) : rewindBook.groups.length === 0 ? (
            <p style={{ fontSize: "var(--fs-body)", color: "var(--text-dim)", lineHeight: "var(--lh-body)", margin: 0 }}>
              Nothing on record for this day.
            </p>
          ) : (
            <div className="holds-list">
              {rewindBook.groups.map((group, i) => (
                <HoldingsGroup
                  key={group.category}
                  first={i === 0}
                  label={group.label}
                  barColor={CATEGORY_COLOR[group.category] ?? "var(--accent)"}
                  barPct={rewindBook.total > 0 ? Math.max((group.total / rewindBook.total) * 100, 2) : 2}
                  total={group.total}
                  expanded
                  onToggle={() => {}}
                >
                  {group.items.map((h) => (
                    <div
                      key={h.id}
                      className="flex items-center border-b border-border-strong last:border-0 gap-3"
                      style={{ paddingTop: "var(--space-row)", paddingBottom: "var(--space-row)" }}
                    >
                      <AssetLogo type={h.type} symbol={h.symbol} name={h.name} size={32} />
                      <div className="flex-1 min-w-0">
                        <div className="text-fg truncate" style={{ fontSize: "var(--fs-body)", fontWeight: 500, lineHeight: "var(--lh-tight)" }}>
                          {h.name}
                        </div>
                        {/* One quiet honesty line per row kind: the unit count
                            actually held that day (tradeables), the equity
                            basis (property), or the flat recorded value the
                            reconstruction had to fall back on. */}
                        {h.units != null ? (
                          <div className="tnum" style={{ fontSize: "var(--fs-caption)", color: "var(--text-faint)", marginTop: 1 }}>
                            {fmtUnits(h.units)} units
                          </div>
                        ) : h.type === "real_estate" ? (
                          <div style={{ fontSize: "var(--fs-caption)", color: "var(--text-faint)", marginTop: 1 }}>
                            equity after mortgage
                          </div>
                        ) : h.approx ? (
                          <div style={{ fontSize: "var(--fs-caption)", color: "var(--text-faint)", marginTop: 1 }}>
                            recorded value
                          </div>
                        ) : null}
                      </div>
                      <div className="text-right shrink-0">
                        {h.displayValue != null ? (
                          <div className="text-fg tnum" style={{ fontSize: "var(--fs-meta)", fontWeight: 500 }}>
                            {formatMoney(h.displayValue, displayCurrency, displayCurrency)}
                          </div>
                        ) : (
                          <>
                            <div className="tnum" style={{ fontSize: "var(--fs-meta)", fontWeight: 500, color: "var(--text-faint)" }}>—</div>
                            <div style={{ fontSize: "var(--fs-micro)", color: "var(--text-faint)" }}>no price record</div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </HoldingsGroup>
              ))}
            </div>
          )}
        </div>
      ) : (
      <div>
        <div className="flex items-center justify-between" style={{ marginTop: "var(--space-5)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--border)", marginBottom: "var(--space-3)" }}>
          <span className="eyebrow" style={{ color: "var(--text-faint)" }}>
            {netWorthAssets.length} {netWorthAssets.length === 1 ? "position" : "positions"}
          </span>
          <button
            onClick={toggleAll}
            className="font-ui"
            aria-label={allExpanded ? "Collapse all holdings" : "Expand all holdings"}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "var(--fs-micro)", letterSpacing: "0.04em", color: "var(--accent-text)", whiteSpace: "nowrap" }}
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </button>
        </div>
        <div className="holds-list">
          {groups.map((group, i) => (
            <HoldingsGroup
              key={group.category}
              first={i === 0}
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
          <div style={{ marginTop: "var(--space-6)" }}>
            <div className="flex items-baseline justify-between" style={{ marginBottom: "var(--space-2)" }}>
              <div
                className="eyebrow"
                style={{ color: "var(--text-faint)" }}
              >
                Future income
              </div>
              <div className="tnum" style={{ fontSize: "var(--fs-meta)", color: "var(--text-dim)" }}>
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
            <div style={{ fontSize: "var(--fs-caption)", color: "var(--text-faint)", marginBottom: "var(--space-3)", lineHeight: "var(--lh-body)" }}>
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
                    style={{ paddingTop: "var(--space-row)", paddingBottom: "var(--space-row)" }}
                  >
                    <AssetLogo type={a.type} symbol={a.symbol ?? null} name={a.name} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="text-fg truncate" style={{ fontSize: "var(--fs-body)", fontWeight: 500, lineHeight: "var(--lh-tight)" }}>
                        {a.name}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-fg tnum" style={{ fontSize: "var(--fs-meta)", fontWeight: 500 }}>
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
      )}
    </>
  );
}

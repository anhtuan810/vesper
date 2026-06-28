"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  NetWorthChart,
  buildSeries,
  rangeStartDate,
  convertPointToDisplay,
  buildLiveRates,
  type SnapshotPoint,
  type Range,
} from "@/components/NetWorthChart";
import { AssetLogo } from "@/components/AssetLogo";
import { MiniSparkline } from "@/components/MiniSparkline";
import { useDisplayCurrency, useSparklines, useVitals } from "@/lib/hooks";
import { toDisplay, formatMoney, type DisplayCurrency } from "@/lib/money";
import { computeCurrentBalance } from "@/lib/mortgage";
import { isIncomePension } from "@/lib/pension";
import { displayName, STARTING_POSITION_CTX, unitNoun } from "@/lib/diary-utils";
import { pctChange, displayTicker } from "@/lib/utils";
import { firstSnapshotDate } from "@/lib/networth-history";
import { useDiaryMarketMoves } from "@/hooks/useDiaryMarketMoves";
import type { DiaryMarketMove } from "@/lib/diary-market-moves";
import { apiFetch } from "@/lib/api";
import {
  CATEGORY_MAP, CATEGORY_LABEL, CATEGORY_ORDER,
} from "@/lib/categories";
import type { LiveAsset, Mutation } from "@/lib/supabase";
import type {
  ConcentrationValue, LiquidityPostureValue, LeverageValue,
  DrawdownValue, CashRealYieldValue, RealGrowthValue, VitalKey,
} from "@/lib/vitals";

// Same range-clipping the desktop dashboard uses (see PortfolioTab): keep every
// row in the window plus the latest row before it as a left anchor.
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

// Category accent (matches the chart bands + the mockup's class colours).
const CAT_DOT: Record<string, string> = {
  property: "var(--prop)", markets: "var(--eq)", crypto: "var(--cry)", reserves: "var(--res)",
};

const fmtPct = (n: number, decimals = 0) =>
  new Intl.NumberFormat("nl-NL", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);

function mDate(m: Mutation): string {
  return (m.occurred_at || m.recorded_at);
}
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Title for a logged decision, built from the mutation (no invented copy).
function decisionTitle(m: Mutation): string {
  const name = displayName(m);
  if (!name) {
    return m.action === "add" ? "Added a holding" : m.action === "remove" ? "Removed a holding" : "Adjusted the portfolio";
  }
  if (m.action === "add") return `Added ${name}`;
  if (m.action === "remove") return `Removed ${name}`;
  return `Adjusted ${name}`;
}
function hasOwnNote(m: Mutation): boolean {
  return !!m.personal_context && m.personal_context !== STARTING_POSITION_CTX;
}
// Signed value moved by a change, in the asset's native currency.
function impactRaw(m: Mutation): number {
  if (m.action === "add") return m.after_value ?? 0;
  if (m.action === "remove") return -(m.before_value ?? 0);
  return (m.after_value ?? 0) - (m.before_value ?? 0);
}
// Value impact of a change → "▲ €34.000" / "▼ €33.000" (or null when flat).
function impact(m: Mutation, displayCurrency: ReturnType<typeof useDisplayCurrency>): { text: string; dn: boolean } | null {
  const cur = m.currency || "USD";
  const amt = impactRaw(m);
  if (!amt) return null;
  const dn = amt < 0;
  return { text: `${dn ? "▼" : "▲"} ${formatMoney(Math.abs(amt), cur, displayCurrency)}`, dn };
}

// Shared with VitalsContent's property lens — toggling on either surface carries
// to the other across navigation.
const PROPERTY_LENS_KEY = "volnar:vitals-show-property";

// A snapshot point's value in the display currency, optionally net of property.
// Property's share is taken from the point's per-type breakdown (the real_estate
// bucket) and applied to the converted total, so it works whether the stored
// total is USD (production) or the home currency (demo) — only the ratio is used.
function pointDisplayValue(
  p: SnapshotPoint,
  includeProperty: boolean,
  displayCurrency: ReturnType<typeof useDisplayCurrency>,
  liveRates: Record<string, number>,
): number {
  const full = convertPointToDisplay(p, displayCurrency, liveRates);
  if (includeProperty) return full;
  const prop = p.breakdown?.real_estate ?? 0;
  const share = p.total_value > 0 ? prop / p.total_value : 0;
  return full * (1 - share);
}

// Rewrites a snapshot point to exclude property: the value drops by property's
// share and the real_estate bucket is removed from the breakdown so the stacked
// bands renormalise. native_breakdown is collapsed to an identity bucket in the
// display currency so convertPointToDisplay returns the adjusted value exactly.
function stripPropertyPoint(
  p: SnapshotPoint,
  displayCurrency: ReturnType<typeof useDisplayCurrency>,
  liveRates: Record<string, number>,
): SnapshotPoint {
  const newVal = pointDisplayValue(p, false, displayCurrency, liveRates);
  const nb: Record<string, number> = {};
  if (p.breakdown) for (const [k, v] of Object.entries(p.breakdown)) { if (k !== "real_estate") nb[k] = v; }
  return { date: p.date, total_value: newVal, breakdown: nb, native_breakdown: { [displayCurrency]: newVal } };
}

const fmtUnits = (n: number) =>
  new Intl.NumberFormat("nl-NL", { maximumFractionDigits: n % 1 === 0 ? 0 : 4 }).format(n);

// Prose bullets describing a decision's mechanics — replaces the stat-chip row so
// the panel reads like a journal entry (units, value movement, money in/out).
function decisionPoints(m: Mutation, displayCurrency: ReturnType<typeof useDisplayCurrency>): string[] {
  const cur = m.currency || "USD";
  const amt = impactRaw(m);
  const money = (v: number) => formatMoney(Math.abs(v), cur, displayCurrency);
  const noun = m.asset_type ? unitNoun(m.asset_type) : "units";
  const pts: string[] = [];
  if (m.action === "add") {
    if (m.after_units != null) pts.push(`Added ${fmtUnits(m.after_units)} ${noun}${amt ? `, about ${money(amt)}` : ""}.`);
    else if (amt) pts.push(`Added about ${money(amt)} to the position.`);
  } else if (m.action === "remove") {
    if (m.before_units != null) pts.push(`Closed ${fmtUnits(m.before_units)} ${noun}${amt ? `, about ${money(amt)}` : ""}.`);
    else if (amt) pts.push(`Took about ${money(amt)} out of the position.`);
  } else {
    if (m.before_units != null && m.after_units != null && m.before_units !== m.after_units)
      pts.push(`Holding moved from ${fmtUnits(m.before_units)} to ${fmtUnits(m.after_units)} ${noun}.`);
    if (m.before_value != null && m.after_value != null)
      pts.push(`Value moved from ${formatMoney(m.before_value, cur, displayCurrency)} to ${formatMoney(m.after_value, cur, displayCurrency)}.`);
    else if (amt) pts.push(`A ${amt < 0 ? "decrease" : "increase"} of about ${money(amt)} that day.`);
  }
  return pts;
}

// Suffix for the growth badge, matching the selected chart range.
function rangeLabel(range: Range, firstDate: string): string {
  switch (range) {
    case "1D": return "today";
    case "1W": return "past week";
    case "1M": return "past month";
    case "3M": return "past 3 months";
    case "1Y": return "past year";
    case "3Y": return "past 3 years";
    default: return `since ${firstDate.slice(0, 4)}`;
  }
}

interface Props {
  assets: LiveAsset[];
  netTotal: number;
  initialSnapshots?: SnapshotPoint[];
  valuesSettled: boolean;
  mutations: Mutation[];
}

// A holding row carries the asset plus the value to show — live equity in Today
// mode, or the snapshot-anchored value held at the selected date in entry mode.
type HoldingItem = { asset: LiveAsset; value: number };
type HoldingGroupData = {
  category: string; label: string; total: number; items: HoldingItem[];
  // Historical (entry) rows suppress live-only adornments (sparkline, day change).
  historical: boolean;
};

// A journal entry: a user decision (mutation) or an auto-generated market swing.
type Entry =
  | { id: string; date: string; kind: "decision"; m: Mutation }
  | { id: string; date: string; kind: "market"; mv: DiaryMarketMove };

// "▲ €1.240" / "▼ €930" — a market swing's signed impact in its display currency.
function marketImpactText(mv: DiaryMarketMove): string | undefined {
  if (!mv.impact) return undefined;
  const dn = mv.impact.total < 0;
  const mc = mv.impact.currency as DisplayCurrency;
  return `${dn ? "▼" : "▲"} ${formatMoney(Math.abs(mv.impact.total), mc, mc)}`;
}

export function OverviewContent({ assets, netTotal, initialSnapshots, valuesSettled, mutations }: Props) {
  const displayCurrency = useDisplayCurrency();
  const { data: vitalsData } = useVitals();
  // Clock-dependent header is computed after mount to stay hydration-safe.
  const [now, setNow] = useState<Date | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setNow(new Date()); }, []);

  const netWorthAssets = useMemo(() => assets.filter((a) => !isIncomePension(a)), [assets]);

  // ── Net-worth chart series (mirrors PortfolioTab's data flow) ──────────────
  // Default to the full history so every decision marker is visible at a glance.
  const [range, setRange] = useState<Range>("All");
  const [fullSnapshots, setFullSnapshots] = useState<SnapshotPoint[]>(initialSnapshots ?? []);
  const [loading, setLoading] = useState(!initialSnapshots);
  // The decision panel is driven by CLICKING a marker (not hover) or the prev/next
  // controls; null = "Today" (the live position). A non-null id selects that entry.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Include/exclude property lens — shared with the Vitals page via the same
  // sessionStorage key, so the choice carries across both surfaces.
  const [includeProperty, setIncludeProperty] = useState(true);
  useEffect(() => {
    const stored = sessionStorage.getItem(PROPERTY_LENS_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored !== null) setIncludeProperty(stored === "true");
  }, []);
  const toggleProperty = () => {
    setIncludeProperty((prev) => {
      const next = !prev;
      try { sessionStorage.setItem(PROPERTY_LENS_KEY, String(next)); } catch {}
      return next;
    });
  };

  // First-visit cinematic reveal (the net-worth line draws on, then a gentle card
  // cascade). Plays once per session and is skipped under prefers-reduced-motion,
  // so every other visit — and reduced-motion users — get the page instantly.
  const [reveal, setReveal] = useState(false);
  useEffect(() => {
    try {
      const seen = sessionStorage.getItem("volnar:overview-revealed");
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      if (!seen && !reduced) {
        setReveal(true); // eslint-disable-line react-hooks/set-state-in-effect
        sessionStorage.setItem("volnar:overview-revealed", "1");
      }
    } catch { /* sessionStorage/matchMedia unavailable — no reveal, page is instant */ }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`/api/snapshots?range=All`, { signal: controller.signal })
      .then((r) => r.json())
      .then((body) => { setFullSnapshots(body.data ?? []); setLoading(false); })
      .catch((err) => { if (err.name !== "AbortError") setLoading(false); });
    return () => controller.abort();
  }, []);

  const todayBreakdown = useMemo(() => {
    const result: Record<string, number> = {};
    for (const a of netWorthAssets) {
      const equity = a.type === "real_estate" ? Math.max(0, a.value - computeCurrentBalance(a)) : a.value;
      const inDisplay = toDisplay(equity, a.currency || "USD", displayCurrency);
      if (inDisplay != null) result[a.type] = (result[a.type] ?? 0) + inDisplay;
    }
    return result;
  }, [netWorthAssets, displayCurrency]);

  // Live property equity (display currency) and whether the book is "mixed"
  // (property + something else) — the lens only matters then.
  const propertyEquity = todayBreakdown.real_estate ?? 0;
  const hasMixed = useMemo(
    () => netWorthAssets.some((a) => a.type === "real_estate") && netWorthAssets.some((a) => a.type !== "real_estate"),
    [netWorthAssets],
  );
  const effectiveInclude = includeProperty || !hasMixed;
  // Live net worth under the current lens.
  const liveNet = effectiveInclude ? netTotal : netTotal - propertyEquity;

  // ── Net-worth chart series (lens-aware) ────────────────────────────────────
  const series = useMemo(() => {
    const liveRates = buildLiveRates();
    const base = effectiveInclude ? fullSnapshots : fullSnapshots.map((p) => stripPropertyPoint(p, displayCurrency, liveRates));
    const tipBreakdown = effectiveInclude
      ? todayBreakdown
      : Object.fromEntries(Object.entries(todayBreakdown).filter(([k]) => k !== "real_estate"));
    return buildSeries(clipToRange(base, range), liveNet, tipBreakdown);
  }, [fullSnapshots, range, liveNet, todayBreakdown, effectiveInclude, displayCurrency]);
  const trackingSinceDate = firstSnapshotDate(fullSnapshots);

  // ── Decision journal (mutations) ───────────────────────────────────────────
  const sortedMutations = useMemo(
    () => [...mutations].sort((a, b) => (mDate(b)).localeCompare(mDate(a))),
    [mutations],
  );
  // Auto-generated market-swing entries (computed from index moves + the user's
  // holdings). Treated as first-class journal entries alongside decisions: plotted
  // on the chart, navigable with prev/next, and selectable.
  const { moves } = useDiaryMarketMoves();
  const entries = useMemo<Entry[]>(() => {
    const rows: Entry[] = [
      ...sortedMutations.map((m): Entry => ({ id: m.id, date: mDate(m).slice(0, 10), kind: "decision", m })),
      ...moves.filter((mv) => mv.impact).map((mv): Entry => ({ id: `mv-${mv.index_symbol}-${mv.date}`, date: mv.date, kind: "market", mv })),
    ];
    // Newest first; on a tie, decisions before market rows.
    return rows.sort((a, b) => b.date.localeCompare(a.date) || (a.kind === b.kind ? 0 : a.kind === "market" ? 1 : -1));
  }, [sortedMutations, moves]);
  // Entries within the selected chart range — the navigator, counter, chart dots
  // and journal preview all scope to this, so stepping never leaves the visible
  // window. "All" (no window start) keeps every entry.
  const navEntries = useMemo(() => {
    const start = rangeStartDate(range);
    return start ? entries.filter((e) => e.date >= start) : entries;
  }, [entries, range]);
  const journalPreview = useMemo(() => navEntries.slice(0, 7), [navEntries]);

  // "On this day, N years ago you…" — the most resonant proof this is a journal.
  // Find a past entry sharing today's day+month; clicking it rewinds the card.
  const onThisDay = useMemo(() => {
    if (!now || entries.length === 0) return null;
    const md = now.toISOString().slice(5, 10);
    const y = now.getFullYear();
    const e = entries.find((x) => x.date.slice(5, 10) === md && Number(x.date.slice(0, 4)) < y);
    if (!e) return null;
    const title = e.kind === "decision"
      ? decisionTitle(e.m)
      : `${e.mv.index_label} ${e.mv.pct_change >= 0 ? "+" : "−"}${fmtPct(Math.abs(e.mv.pct_change), 1)}%`;
    return { id: e.id, years: y - Number(e.date.slice(0, 4)), title };
  }, [now, entries]);

  // Relative age of the most recent entry, for the Today panel's "Last entry · …".
  const lastEntryAgo = useMemo(() => {
    if (!now || entries.length === 0) return null;
    const days = Math.floor((Date.parse(now.toISOString().slice(0, 10)) - Date.parse(entries[0].date)) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return `${days} days ago`;
    const months = Math.round(days / 30);
    return months <= 1 ? "a month ago" : `${months} months ago`;
  }, [now, entries]);

  // Chart markers — one per entry. Decisions use the accent ("you"); market swings
  // the muted "market" colour. Each carries the short content the chart shows on
  // hover; hovering previews, clicking commits the selection (drives the page).
  const markers = useMemo(
    () => navEntries.map((e) => e.kind === "decision"
      ? { id: e.id, date: e.date, kind: "you" as const, title: decisionTitle(e.m), sub: shortDate(e.date), value: impact(e.m, displayCurrency)?.text }
      : { id: e.id, date: e.date, kind: "market" as const, title: `${e.mv.index_label} ${e.mv.pct_change >= 0 ? "+" : "−"}${fmtPct(Math.abs(e.mv.pct_change), 1)}%`, sub: shortDate(e.date), value: marketImpactText(e.mv) }),
    [navEntries, displayCurrency],
  );

  // Navigation order: Today (null) first, then in-range entries newest→oldest. ←
  // steps older, → steps newer (back toward Today).
  const navIds = useMemo<(string | null)[]>(() => [null, ...navEntries.map((e) => e.id)], [navEntries]);
  const navIndex = navIds.indexOf(selectedId);
  const goOlder = () => setSelectedId(navIds[Math.min(navIndex + 1, navIds.length - 1)] ?? null);
  const goNewer = () => setSelectedId(navIds[Math.max(navIndex - 1, 0)] ?? null);
  const canOlder = navIndex >= 0 && navIndex < navIds.length - 1;
  const canNewer = navIndex > 0;

  // Clicking a journal-preview row selects that entry — same as clicking its
  // chart dot: it drives the panel and highlights the marker on the graph.
  const selectRowProps = (id: string) => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-pressed": selectedId === id,
    onClick: () => setSelectedId(id),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(id); }
    },
  });

  // The selected entry drives the panel; null id = Today (the live position).
  const selectedEntry = useMemo(
    () => (selectedId ? entries.find((e) => e.id === selectedId) ?? null : null),
    [entries, selectedId],
  );
  const selectedDecision = selectedEntry?.kind === "decision" ? selectedEntry.m : null;
  const selectedMove = selectedEntry?.kind === "market" ? selectedEntry.mv : null;
  const selectedDate = selectedEntry?.date ?? null;
  const isToday = !selectedEntry;

  // Once an entry is selected, ← / → step through the journal and Esc returns
  // to Today — so scrubbing 68 entries doesn't mean 68 clicks. Gated on an active
  // selection so it never hijacks arrow keys for someone who hasn't engaged, and
  // ignored while typing (chat rail, inputs).
  useEffect(() => {
    if (isToday) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); setSelectedId(navIds[Math.min(navIndex + 1, navIds.length - 1)] ?? null); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setSelectedId(navIds[Math.max(navIndex - 1, 0)] ?? null); }
      else if (e.key === "Escape") { e.preventDefault(); setSelectedId(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isToday, navIndex, navIds]);

  // Changing the period rescopes the navigator. If the selected entry falls
  // outside the new window, snap back to Today so the navigator and chart agree.
  const handleRangeChange = (r: Range) => {
    setRange(r);
    const start = rangeStartDate(r);
    if (selectedId && start) {
      const e = entries.find((x) => x.id === selectedId);
      if (e && e.date < start) setSelectedId(null);
    }
  };

  // The snapshot on/before the selected entry's date — anchors both the headline
  // and the holdings to the same point in time so they reconcile with the chart.
  const selectedSnapshot = useMemo(() => {
    if (!selectedDate) return null;
    let best: SnapshotPoint | null = null;
    for (const p of fullSnapshots) { if (p.date <= selectedDate) best = p; else break; }
    return best ?? fullSnapshots[0] ?? null;
  }, [selectedDate, fullSnapshots]);

  // Net worth as of the selection: live for Today, else the chart's own value at
  // the entry's date, so the headline matches the line and is currency-correct
  // under either lens.
  const headlineNet = useMemo(() => {
    if (isToday || !selectedSnapshot) return liveNet;
    return pointDisplayValue(selectedSnapshot, effectiveInclude, displayCurrency, buildLiveRates());
  }, [isToday, selectedSnapshot, effectiveInclude, displayCurrency, liveNet]);

  // Today's marker highlights only if an entry is actually dated today; otherwise
  // Today shows no selected marker. `now` keeps this hydration-safe.
  const todayEntryId = useMemo(() => {
    if (!now) return null;
    const t = now.toISOString().slice(0, 10);
    return entries.find((e) => e.date === t)?.id ?? null;
  }, [now, entries]);
  const highlightMarkerId = selectedId ?? todayEntryId;

  // Growth over the SELECTED range (so it changes with the 1W/1M/1Y/All pills):
  // from the start of the visible window to the live net worth, on the same lens.
  const rangeBadge = useMemo(() => {
    if (series.length < 2) return null;
    // series[0] may be a pre-window ANCHOR (the last point before the window,
    // kept so the chart line enters from the left). Measure from the first point
    // INSIDE the window, else the % spans more time than the range label claims.
    const windowStart = rangeStartDate(range);
    const startPoint = windowStart ? series.find((p) => p.date >= windowStart) ?? series[series.length - 1] : series[0];
    const startVal = convertPointToDisplay(startPoint, displayCurrency, buildLiveRates());
    if (!startVal || startVal <= 0) return null;
    const delta = liveNet - startVal;
    const pct = (delta / startVal) * 100;
    const dn = delta < 0;
    // Lead with the money moved (investors think in €, not just %), % muted after.
    const pctStr = Math.abs(pct).toLocaleString("nl-NL", { maximumFractionDigits: 1 });
    return `${dn ? "▼" : "▲"} ${formatMoney(Math.abs(delta), displayCurrency, displayCurrency)} · ${dn ? "−" : "+"}${pctStr}% ${rangeLabel(range, startPoint.date)}`;
  }, [series, liveNet, displayCurrency, range]);

  // In entry mode the headline shows the value AS OF the selected date; this
  // surfaces that framing plus how the portfolio has moved to today, so a
  // rewound number is never mistaken for the live balance.
  const asOfDelta = useMemo(() => {
    if (isToday) return null;
    const delta = liveNet - headlineNet;
    if (!Number.isFinite(delta) || Math.abs(delta) < 1) return null;
    const dn = delta < 0;
    return { dn, text: `${dn ? "▼" : "▲"} ${formatMoney(Math.abs(delta), displayCurrency, displayCurrency)} to today` };
  }, [isToday, liveNet, headlineNet, displayCurrency]);

  // ── Holdings grouped into the 4 semantic categories ────────────────────────
  const symbols = useMemo(
    () => netWorthAssets.map((a) => a.symbol).filter((s): s is string => !!s),
    [netWorthAssets],
  );
  const sparklines = useSparklines(symbols, "1W");

  const byOrder = (a: { category: string }, b: { category: string }) =>
    (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99);

  const groups = useMemo<HoldingGroupData[]>(() => {
    // ── Today: live, asset-driven grouping ──
    if (isToday || !selectedSnapshot || !selectedDate) {
      const byCategory: Record<string, HoldingItem[]> = {};
      for (const a of netWorthAssets) {
        if (!effectiveInclude && a.type === "real_estate") continue;
        const cat = CATEGORY_MAP[a.type] ?? "reserves";
        const equity = a.type === "real_estate" ? Math.max(0, a.value - computeCurrentBalance(a)) : a.value;
        const value = toDisplay(equity, a.currency || "USD", displayCurrency) ?? 0;
        (byCategory[cat] ??= []).push({ asset: a, value });
      }
      return Object.entries(byCategory)
        .map(([cat, items]) => ({
          category: cat, label: CATEGORY_LABEL[cat] ?? cat, historical: false,
          items: [...items].sort((a, b) => b.value - a.value),
          total: items.reduce((s, it) => s + it.value, 0),
        }))
        .sort(byOrder);
    }

    // ── Entry: snapshot-anchored category totals + the assets held then ──
    const liveRates = buildLiveRates();
    const fullDisplay = convertPointToDisplay(selectedSnapshot, displayCurrency, liveRates);
    const base = selectedSnapshot.total_value || 1;
    const d = selectedDate;

    // Each asset's last recorded value on/before the selected date (0 = removed /
    // not yet held). sortedMutations is newest-first, so the first hit per asset
    // within the window is the latest state at that time.
    const weightByAsset = new Map<string, number>();
    for (const m of sortedMutations) {
      if (!m.asset_id || weightByAsset.has(m.asset_id)) continue;
      if (mDate(m).slice(0, 10) > d) continue;
      const w = m.action === "remove" ? 0 : (toDisplay(m.after_value ?? 0, m.currency || "USD", displayCurrency) ?? 0);
      weightByAsset.set(m.asset_id, w);
    }
    const assetById = new Map(netWorthAssets.map((a) => [a.id, a]));

    // Category totals from the snapshot's per-type breakdown (display currency,
    // lens-aware) — these sum to the headline.
    const catTotal: Record<string, number> = {};
    for (const [type, v] of Object.entries(selectedSnapshot.breakdown ?? {})) {
      if (!effectiveInclude && type === "real_estate") continue;
      const cat = CATEGORY_MAP[type] ?? "reserves";
      catTotal[cat] = (catTotal[cat] ?? 0) + (v / base) * fullDisplay;
    }

    // The assets actually held then, grouped, with their recorded weights.
    const catAssets: Record<string, { asset: LiveAsset; weight: number }[]> = {};
    for (const [id, w] of weightByAsset) {
      if (w <= 0) continue;
      const a = assetById.get(id);
      if (!a) continue;
      if (!effectiveInclude && a.type === "real_estate") continue;
      const cat = CATEGORY_MAP[a.type] ?? "reserves";
      (catAssets[cat] ??= []).push({ asset: a, weight: w });
    }

    const cats = new Set([...Object.keys(catTotal), ...Object.keys(catAssets)]);
    const out: HoldingGroupData[] = [];
    for (const cat of cats) {
      const total = catTotal[cat] ?? 0;
      if (total < 1) continue;
      const arr = catAssets[cat] ?? [];
      const sumW = arr.reduce((s, x) => s + x.weight, 0);
      // Scale the held assets to the snapshot's category total so each group's
      // rows reconcile with its header (recorded values aren't market-adjusted).
      const items: HoldingItem[] = sumW > 0
        ? arr.map((x) => ({ asset: x.asset, value: total * (x.weight / sumW) })).sort((p, q) => q.value - p.value)
        : [];
      out.push({ category: cat, label: CATEGORY_LABEL[cat] ?? cat, historical: true, items, total });
    }
    return out.sort(byOrder);
  }, [isToday, selectedSnapshot, selectedDate, sortedMutations, netWorthAssets, displayCurrency, effectiveInclude]);

  // ── Vitals summary + the six cards ─────────────────────────────────────────
  const vitalsByKey = useMemo(() => {
    const map = new Map<VitalKey, { band: string; value: unknown; applies: boolean }>();
    for (const v of vitalsData?.vitals ?? []) map.set(v.key, v);
    return map;
  }, [vitalsData]);

  const vitalSummary = useMemo(() => {
    const active = (vitalsData?.vitals ?? []).filter((v) => v.applies);
    const healthy = active.filter((v) => v.band === "green").length;
    const watch = active.filter((v) => v.band === "amber" || v.band === "red").length;
    return { healthy, watch };
  }, [vitalsData]);

  return (
    <>
      {/* ── Dashboard card ── */}
      <section className={`dash${reveal ? " rv rv-1" : ""}`}>
        <div className="dash-h">
          <div>
            {/* Lens selector (mirrors the phone's "Net worth · Liquid"): full net
                worth vs. excluding the illiquid property. Only when there's both. */}
            {hasMixed ? (
              <div className="nwsel" role="group" aria-label="Net worth lens">
                <button type="button" className={`nwsel-opt${includeProperty ? " on" : ""}`} aria-pressed={includeProperty} onClick={() => { if (!includeProperty) toggleProperty(); }}>Net worth</button>
                <span className="nwsel-dot" aria-hidden="true" />
                <button type="button" className={`nwsel-opt${!includeProperty ? " on" : ""}`} aria-pressed={!includeProperty} onClick={() => { if (includeProperty) toggleProperty(); }}>Liquid</button>
              </div>
            ) : (
              <span className="eyebrow">Net worth</span>
            )}
            <div className="nwnum">{formatMoney(headlineNet, displayCurrency, displayCurrency)}</div>
            {isToday
              ? rangeBadge && <div className="nwbasis"><span className="badge">{rangeBadge}</span></div>
              : (
                <div className="nwbasis nwbasis-asof">
                  <span className="asof">as of {shortDate(selectedDate!)}</span>
                  {asOfDelta && <span className={`badge${asOfDelta.dn ? " dn" : ""}`}>{asOfDelta.text}</span>}
                </div>
              )}
          </div>
        </div>

        {isToday && onThisDay && (
          <button type="button" className="onthisday" onClick={() => { setRange("All"); setSelectedId(onThisDay.id); }}>
            <span className="otd-eyebrow">On this day · {onThisDay.years} {onThisDay.years === 1 ? "year" : "years"} ago</span>
            <span className="otd-text">{onThisDay.title}</span>
          </button>
        )}

        <div style={{ margin: "18px 0 4px" }}>
          <NetWorthChart
            range={range}
            onRangeChange={handleRangeChange}
            series={series}
            loading={loading}
            valuesSettled={valuesSettled}
            realPointCount={fullSnapshots.length}
            trackingSinceDate={trackingSinceDate}
            markers={markers}
            selectedMarkerId={highlightMarkerId}
            onMarkerClick={setSelectedId}
            revealLine={reveal}
          />
        </div>

        {/* Name the scrub: teach that the line is a walkable timeline of entries.
            Shown at rest (Today); once scrubbing, the nav row carries the cue. */}
        {isToday && navEntries.length > 0 && (
          <div className="chart-legend">
            <span className="cl-item"><span className="cl-dot you" aria-hidden="true" /> Your decisions</span>
            <span className="cl-item"><span className="cl-dot mkt" aria-hidden="true" /> Market swings</span>
            <span className="cl-hint">Hover the line to peek · click a dot to step into that decision</span>
          </div>
        )}

        {/* selected entry / today, with prev-next navigation. Auto market entries
            are flagged by the "Auto · Market" tag rather than a panel treatment. */}
        <div className="ep-inline">
          <div className="ep-nav">
            <button type="button" className="ep-step" onClick={goOlder} disabled={!canOlder} aria-label="Previous entry">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <button type="button" className="ep-today" onClick={() => setSelectedId(null)} disabled={isToday}>
              Today
            </button>
            <button type="button" className="ep-step" onClick={goNewer} disabled={!canNewer} aria-label="Next entry">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </button>
            {!isToday && (
              <span className="ep-pos">{navIndex} of {navEntries.length}</span>
            )}
            {!isToday && (
              <span className="ep-hint" aria-hidden="true">← → to step · Esc for today</span>
            )}
          </div>

          {isToday ? (
            <>
              <div className="ep-top">
                <span className="ep-date">{lastEntryAgo ? `Last entry · ${lastEntryAgo}` : "Live position"}</span>
                <span className="ep-kind milestone">Today</span>
              </div>
              <h3 className="ep-title">Your position today</h3>
              <p className="ep-why">
                {entries.length === 0
                  ? "This is your starting position. From here, every change you make is journalled with the reasoning behind it — and the line above becomes a record you can step back through."
                  : <>The line above holds {entries.length} {entries.length === 1 ? "entry" : "decisions and market moves"} — step back through it to revisit the reasoning behind any number.</>}
              </p>
            </>
          ) : selectedMove ? (() => {
            const mv = selectedMove;
            const imp = mv.impact!;
            const mc = imp.currency as typeof displayCurrency;
            const dn = imp.total < 0;
            return (
              <>
                <div className="ep-top">
                  <span className="ep-date">{shortDate(mv.date)}</span>
                  <span className="ep-kind market">Auto · Market</span>
                </div>
                <h3 className="ep-title">{mv.index_label} {mv.pct_change >= 0 ? "+" : "−"}{fmtPct(Math.abs(mv.pct_change), 1)}%</h3>
                <p className="ep-why">
                  Your portfolio {dn ? "lost" : "gained"} {formatMoney(Math.abs(imp.total), mc, mc)} that day
                  {imp.movers[0] ? `, led by ${imp.movers[0].label}` : ""}. No action taken — recorded automatically.
                </p>
                {imp.movers.length > 0 && (
                  <ul className="ep-points">
                    {imp.movers.map((h) => (
                      <li key={h.symbol}>{h.label} {h.impact < 0 ? "down" : "up"} {formatMoney(Math.abs(h.impact), mc, mc)} that day.</li>
                    ))}
                  </ul>
                )}
              </>
            );
          })() : (() => {
            const m = selectedDecision!;
            const own = hasOwnNote(m);
            const points = decisionPoints(m, displayCurrency);
            return (
              <>
                <div className="ep-top">
                  <span className="ep-date">{shortDate(mDate(m))}</span>
                </div>
                <h3 className="ep-title">{decisionTitle(m)}</h3>
                {m.market_context && <p className="ep-ctx">{m.market_context}</p>}
                <p className="ep-why">
                  {own ? m.personal_context
                    : m.personal_context === STARTING_POSITION_CTX ? "Started tracking from here."
                    : "Recorded automatically — no note attached."}
                </p>
                {points.length > 0 && (
                  <ul className="ep-points">
                    {points.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                )}
              </>
            );
          })()}
        </div>

        {/* expandable holdings */}
        <div className="holds" id="holdings">
          {!isToday && (
            <div className="holds-asof">Holdings as of {shortDate(selectedDate!)}</div>
          )}
          {groups.map((g) => (
            <HoldingGroup
              key={g.category}
              category={g.category}
              label={g.label}
              total={g.total}
              pct={headlineNet > 0 ? Math.round((g.total / headlineNet) * 100) : 0}
              items={g.items}
              historical={g.historical}
              displayCurrency={displayCurrency}
              sparklines={sparklines}
            />
          ))}
        </div>

        {/* vitals footer */}
        <div className="dash-foot">
          <span className="dots" aria-hidden="true">
            {Array.from({ length: vitalSummary.healthy }).map((_, i) => <i key={`h${i}`} />)}
            {Array.from({ length: vitalSummary.watch }).map((_, i) => <i key={`w${i}`} className="w" />)}
          </span>
          {vitalsData
            ? `Vitals · ${vitalSummary.healthy} healthy · ${vitalSummary.watch} to watch · every change is journalled`
            : "Vitals loading · every change is journalled"}
        </div>
      </section>

      {/* ── Vitals ── */}
      <section className={`sec${reveal ? " rv rv-2" : ""}`}>
        <div className="sec-top">
          <div>
            <span className="eyebrow">Vitals</span>
          </div>
          <Link className="lk" href="/vitals">See all Vitals →</Link>
        </div>
        <div className="vrow">
          <VitalCard name="Concentration" v={vitalsByKey.get("concentration")} render={(val: ConcentrationValue, b) => {
            // Lens-aware: show the investable top position when property is excluded.
            const pct = effectiveInclude ? val.topPositionPct : (val.investableTopPositionPct ?? val.topPositionPct);
            const name = effectiveInclude ? val.topPositionName : (val.investableTopPositionName ?? val.topPositionName);
            return {
              value: `${fmtPct(pct)}%`, unit: name ? ` · ${name}` : "",
              read: effectiveInclude ? "Largest single position as a share of the book." : "Largest investable position, property aside.",
              bar: clamp(pct), thr: 35, band: b,
            };
          }} />
          <VitalCard name="Liquidity" v={vitalsByKey.get("liquidityPosture")} render={(val: LiquidityPostureValue, b) => ({
            value: `${fmtPct(val.deployable1wPct)}%`, unit: " in a week",
            read: "Share of wealth reachable within seven days.", bar: clamp(val.deployable1wPct), thr: 15, band: b,
          })} />
          {effectiveInclude && (
          <VitalCard name="Leverage" v={vitalsByKey.get("leverage")} render={(val: LeverageValue, b) => ({
            value: `${fmtPct(val.ltvPct)}%`, unit: " LTV",
            read: "Loan-to-value across your property.", bar: clamp(val.ltvPct), thr: 50, thr2: 75, band: b,
          })} />
          )}
          <VitalCard name="Drawdown" v={vitalsByKey.get("drawdown")} render={(val: DrawdownValue, b) => ({
            value: `−${fmtPct(Math.abs(val.shockPctOfNw))}%`, unit: " 2008-style",
            read: "Modelled hit from a simultaneous market crash.", bar: clamp(100 - Math.abs(val.shockPctOfNw)), badTail: clamp(Math.abs(val.shockPctOfNw)), band: b,
          })} />
          <VitalCard name="Cash yield" v={vitalsByKey.get("cashRealYield")} render={(val: CashRealYieldValue, b) => ({
            value: `${val.realYieldPct >= 0 ? "+" : "−"}${fmtPct(Math.abs(val.realYieldPct), 1)}%`, unit: " real",
            read: "Cash yield after inflation and tax.", bar: clamp(((val.realYieldPct + 5) / 10) * 100), band: b,
          })} />
          <VitalCard name="Real growth" v={vitalsByKey.get("realGrowth")} render={(val: RealGrowthValue, b) => ({
            value: `${val.real12moPct >= 0 ? "+" : "−"}${fmtPct(Math.abs(val.real12moPct), 1)}%`, unit: " past year",
            read: "Net-worth growth ahead of inflation.", bar: clamp(((val.real12moPct + 10) / 30) * 100), band: b,
          })} />
        </div>
      </section>

      {/* ── Decision journal ── */}
      <section className={`sec${reveal ? " rv rv-3" : ""}`}>
        <div className="sec-top">
          <div>
            <span className="eyebrow">Decision journal</span>
          </div>
          <Link className="lk" href="/diary">Open the journal →</Link>
        </div>
        <div className="ledger">
          {journalPreview.length === 0 ? (
            <div className="led-empty">Nothing logged yet — your decisions will appear here.</div>
          ) : journalPreview.map((row) => {
            if (row.kind === "market") {
              const mv = row.mv;
              const imp = mv.impact!;
              const mc = imp.currency as typeof displayCurrency;
              const dn = imp.total < 0;
              const top = imp.movers[0];
              const why = `Your portfolio ${dn ? "lost" : "gained"} ${formatMoney(Math.abs(imp.total), mc, mc)} that day`
                + (top ? `, led by ${top.label}.` : ".");
              return (
                <div className={`led${selectedId === row.id ? " sel" : ""}`} key={row.id} {...selectRowProps(row.id)}>
                  <span className={`led-dot${dn ? " dn" : ""}`} />
                  <span className="led-date">{shortDate(mv.date)}</span>
                  <div>
                    <div className="led-l1">
                      <span className="led-title">{mv.index_label} {mv.pct_change >= 0 ? "+" : "−"}{fmtPct(Math.abs(mv.pct_change), 1)}%</span>
                      <span className="led-tag auto">Market</span>
                    </div>
                    <div className="led-why">{why}</div>
                  </div>
                  <span className={`led-imp${dn ? " dn" : ""}`}>{dn ? "▼" : "▲"} {formatMoney(Math.abs(imp.total), mc, mc)}</span>
                </div>
              );
            }
            const m = row.m;
            const own = hasOwnNote(m);
            const imp = impact(m, displayCurrency);
            const why = own ? m.personal_context
              : m.market_context ? m.market_context
              : m.personal_context === STARTING_POSITION_CTX ? "Started tracking from here." : "Recorded automatically.";
            return (
              <div className={`led${selectedId === m.id ? " sel" : ""}`} key={m.id} {...selectRowProps(m.id)}>
                <span className={`led-dot${imp?.dn ? " dn" : ""}`} />
                <span className="led-date">{shortDate(mDate(m))}</span>
                <div>
                  <div className="led-l1">
                    <span className="led-title">{decisionTitle(m)}</span>
                    <span className={`led-tag${own ? "" : " auto"}`}>{own ? "You" : "Auto"}</span>
                  </div>
                  <div className="led-why">{why}</div>
                </div>
                {imp && <span className={`led-imp${imp.dn ? " dn" : ""}`}>{imp.text}</span>}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Private by design ── */}
      <section className={`sec${reveal ? " rv rv-4" : ""}`} style={{ marginBottom: 8 }}>
        <div className="trust">
          <span className="t">Private by design.</span>
          <div className="items">
            <span className="it"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>EU-hosted</span>
            <span className="it"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2Z" /><path d="M9 9h6" /></svg>Append-only journal</span>
            <span className="it"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></svg>No broker sync</span>
          </div>
        </div>
      </section>
    </>
  );
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

// ── Vital card ───────────────────────────────────────────────────────────────
type Spec = { value: string; unit: string; read: string; bar: number; thr?: number; thr2?: number; badTail?: number; band: string };
function VitalCard<T>({ name, v, render }: {
  name: string;
  v?: { band: string; value: unknown; applies: boolean };
  render: (value: T, band: string) => Spec;
}) {
  if (!v || !v.applies) {
    return (
      <div className="vital">
        <div className="vt-top"><span className="vt-name">{name}</span><span className="vt-band">—</span></div>
        <div className="vt-val" style={{ color: "var(--muted)" }}>—</div>
        <div className="vt-read">Not enough data yet.</div>
      </div>
    );
  }
  const spec = render(v.value as T, v.band);
  const cls = v.band === "amber" ? "warn" : v.band === "red" ? "bad" : "";
  const bandLabel = v.band === "green" ? "Healthy" : v.band === "red" ? "Alert" : "Watch";
  const fill = cls === "warn" ? "vc-warn" : cls === "bad" ? "vc-bad" : "vc-ok";
  return (
    <div className={`vital ${cls}`}>
      <div className="vt-top">
        <span className="vt-name">{name}</span>
        <span className="vt-band">{bandLabel}</span>
      </div>
      <div className="vt-val">{spec.value}<span>{spec.unit}</span></div>
      <svg className="vc" viewBox="0 0 100 24" aria-hidden="true">
        <rect className="vc-track" x="0" y="9" width="100" height="7" rx="2.5" />
        {spec.badTail != null ? (
          <>
            <rect className="vc-ok" x="0" y="9" width={spec.bar} height="7" rx="2.5" />
            <rect className="vc-bad" x={spec.bar} y="9" width={spec.badTail} height="7" rx="2.5" />
          </>
        ) : (
          <rect className={fill} x="0" y="9" width={spec.bar} height="7" rx="2.5" />
        )}
        {spec.thr != null && <line className="vc-thr" x1={spec.thr} y1="4.5" x2={spec.thr} y2="20.5" />}
        {spec.thr2 != null && <line className="vc-thr" x1={spec.thr2} y1="4.5" x2={spec.thr2} y2="20.5" />}
      </svg>
      <div className="vt-read">{spec.read}</div>
    </div>
  );
}

// ── Expandable holdings group ────────────────────────────────────────────────
function HoldingGroup({ category, label, total, pct, items, historical, displayCurrency, sparklines }: {
  category: string; label: string; total: number; pct: number;
  items: HoldingItem[]; historical: boolean;
  displayCurrency: ReturnType<typeof useDisplayCurrency>;
  sparklines: Record<string, number[]>;
}) {
  const [open, setOpen] = useState(false);
  const [maxH, setMaxH] = useState(0);
  const posRef = useRef<HTMLDivElement>(null);
  const accent = CAT_DOT[category] ?? "var(--green)";
  const panelId = `vh-pos-${category}`;

  const toggle = () => {
    const el = posRef.current;
    const next = !open;
    setMaxH(next && el ? el.scrollHeight : 0);
    setOpen(next);
  };

  return (
    <div className={`hg${open ? " open" : ""}`}>
      <button className="hg-h" type="button" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
        <span className="dr-n"><i style={{ background: accent }} />{label}</span>
        <span className="dr-bar"><span style={{ width: `${Math.max(pct, 2)}%`, background: accent }} /></span>
        <span className="dr-v">{formatMoney(total, displayCurrency, displayCurrency)}<small>{pct}%</small></span>
        <svg className="hg-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <div className="hg-pos" id={panelId} ref={posRef} style={{ maxHeight: maxH }}>
        {items.map(({ asset, value }) => (
          <PositionRow
            key={asset.id}
            asset={asset}
            value={value}
            historical={historical}
            displayCurrency={displayCurrency}
            closes={!historical && asset.symbol ? sparklines[asset.symbol] : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function PositionRow({ asset, value, historical, displayCurrency, closes }: {
  asset: LiveAsset; value: number; historical: boolean;
  displayCurrency: ReturnType<typeof useDisplayCurrency>; closes?: number[];
}) {
  const isProperty = asset.type === "real_estate";
  // Value is supplied by the parent: live equity in Today mode, the snapshot-
  // anchored value held at the selected date in entry mode. Both are already in
  // the display currency, so render with an identity conversion.
  const valueText = formatMoney(value, displayCurrency, displayCurrency);
  const chg = pctChange(asset.livePrice, asset.livePrev);
  const up = chg != null && chg >= 0;
  const hasSpark = !historical && !!closes && closes.length >= 2;
  // Owned-% is a live concept (equity vs market value) — Today only.
  const liveEquity = isProperty ? Math.max(0, asset.value - computeCurrentBalance(asset)) : asset.value;
  const owned = !historical && isProperty && asset.value > 0 ? Math.round((liveEquity / asset.value) * 100) : null;

  const sub = asset.symbol
    ? `${displayTicker(asset.symbol)}${!historical && asset.units != null ? ` · ${fmtPct(asset.units, asset.units % 1 === 0 ? 0 : 2)} ${unitNoun(asset.type)}` : ""}`
    : isProperty ? "Property" : CATEGORY_LABEL[CATEGORY_MAP[asset.type] ?? "reserves"];

  return (
    <Link className="pos" href={`/asset?id=${asset.id}`}>
      <AssetLogo type={asset.type} symbol={asset.symbol ?? null} name={asset.name} size={42} />
      <div className="pos-m">
        <span className="pos-n">{asset.name}</span>
        <span className="pos-sub">{sub}</span>
      </div>
      {hasSpark
        ? <MiniSparkline prices={closes!} directionUp={chg == null ? undefined : up} width={80} height={28} />
        : <span />}
      <div className="pos-v">
        <span className="pos-val">{valueText}</span>
        {owned != null
          ? <span className="pos-own">{owned}% owned</span>
          : !historical && chg != null && <span className={`pos-chg ${up ? "up" : "dn"}`}>{up ? "+" : "−"}{fmtPct(Math.abs(chg), 1)}%</span>}
      </div>
    </Link>
  );
}

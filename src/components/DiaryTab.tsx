"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { formatDate, getMonthKey, getMonthLabel } from "@/lib/utils";
import { useDisplayCurrency } from "@/lib/hooks";
import { formatMoney, toUsdClient, type DisplayCurrency } from "@/lib/money";
import type { Mutation } from "@/lib/supabase";
import { AssetLogo } from "@/components/AssetLogo";

const TRADEABLE_TYPES = new Set(["stocks", "etf", "crypto", "gold"]);
const STARTING_POSITION_CTX = "Starting position — no purchase history captured";

function unitNoun(assetType: string | null): string {
  if (assetType === "crypto") return "units";
  if (assetType === "gold") return "oz";
  return "shares";
}

function hasContent(m: Mutation): boolean {
  return m.before_value != null || m.after_value != null || !!m.personal_context;
}

function buildValueNode(m: Mutation, displayCurrency: DisplayCurrency): React.ReactNode {
  const isUnitEligible =
    m.asset_type != null &&
    TRADEABLE_TYPES.has(m.asset_type) &&
    (m.before_units != null || m.after_units != null);
  const noun = unitNoun(m.asset_type);

  if (isUnitEligible) {
    if (m.action === "add" && m.after_units != null) {
      return (
        <span style={{ fontSize: 13, fontWeight: 500, flexShrink: 0, color: "var(--positive-text)" }}>
          +{m.after_units.toLocaleString()} {noun}
        </span>
      );
    }
    if (m.action === "edit") {
      const delta = (m.after_units ?? 0) - (m.before_units ?? 0);
      if (delta !== 0) return (
        <span style={{ fontSize: 13, fontWeight: 500, flexShrink: 0, color: delta >= 0 ? "var(--positive-text)" : "var(--negative-text)" }}>
          {delta >= 0 ? "+" : ""}{delta.toLocaleString()} {noun}
        </span>
      );
    }
    if (m.action === "remove" && m.before_units != null) {
      return (
        <span style={{ fontSize: 13, fontWeight: 500, flexShrink: 0, color: "var(--negative-text)", textDecoration: "line-through" }}>
          {m.before_units.toLocaleString()} {noun}
        </span>
      );
    }
  }

  const cur = m.currency || "USD";
  if (m.action === "add" && m.after_value != null) {
    return (
      <span style={{ fontSize: 13, fontWeight: 500, flexShrink: 0, color: "var(--positive-text)" }}>
        +{formatMoney(m.after_value, cur, displayCurrency)}
      </span>
    );
  }
  if (m.action === "edit") {
    const valDelta = m.before_value != null && m.after_value != null ? m.after_value - m.before_value : null;
    if (valDelta !== null && valDelta !== 0) return (
      <span style={{ fontSize: 13, fontWeight: 500, flexShrink: 0, color: valDelta >= 0 ? "var(--positive-text)" : "var(--negative-text)" }}>
        {valDelta >= 0 ? "+" : ""}{formatMoney(valDelta, cur, displayCurrency)}
      </span>
    );
    if (m.after_value != null) return (
      <span style={{ fontSize: 13, fontWeight: 500, flexShrink: 0, color: "var(--text-dim)" }}>
        {formatMoney(m.after_value, cur, displayCurrency)}
      </span>
    );
  }
  if (m.action === "remove" && m.before_value != null) {
    return (
      <span style={{ fontSize: 13, fontWeight: 500, flexShrink: 0, color: "var(--negative-text)", textDecoration: "line-through" }}>
        {formatMoney(m.before_value, cur, displayCurrency)}
      </span>
    );
  }
  return null;
}

function relativeAge(past: Date, now: Date): string {
  const months = (now.getFullYear() - past.getFullYear()) * 12 + (now.getMonth() - past.getMonth());
  const years = Math.floor(months / 12);
  if (years >= 1) return years === 1 ? "1 year ago" : `${years} years ago`;
  if (months <= 1) return "1 month ago";
  return `${months} months ago`;
}

function displayName(m: Mutation): string {
  return m.asset?.name ?? m.asset_name ?? "";
}

// ── Duplicate-row grouping ─────────────────────────────────────────────────────

type DiaryItem =
  | { kind: "singleton"; mutation: Mutation }
  | { kind: "group"; id: string; anchor: Mutation; members: Mutation[]; groupName: string };

function commonNamePrefix(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return a.slice(0, i).replace(/[\s\-–—,.:;]+$/, "").trim();
}

function assetTypeLabel(assetType: string | null): string {
  const map: Record<string, string> = {
    stocks: "stock", etf: "ETF", crypto: "crypto", gold: "gold",
    cash: "cash", real_estate: "property", business: "business",
  };
  return (assetType && map[assetType]) || "";
}

function actionVerb(action: string): string {
  if (action === "add") return "added";
  if (action === "remove") return "removed";
  return "edited";
}

function buildDisplayItems(mutations: Mutation[], disableGrouping: boolean): DiaryItem[] {
  if (disableGrouping || mutations.length === 0) {
    return mutations.map((m) => ({ kind: "singleton" as const, mutation: m }));
  }

  const items: DiaryItem[] = [];
  let runGroup: Mutation[] = [];
  let runPrefix = "";

  function closeGroup() {
    if (runGroup.length === 0) return;
    if (runGroup.length < 3) {
      for (const m of runGroup) items.push({ kind: "singleton", mutation: m });
    } else {
      const anchor = runGroup[0];
      let groupName: string;
      if (anchor.asset_id) {
        groupName = displayName(anchor);
      } else {
        const typeLabel = assetTypeLabel(anchor.asset_type);
        groupName = runPrefix.length >= 3
          ? [runPrefix, typeLabel, "entries"].filter(Boolean).join(" ")
          : displayName(anchor);
      }
      items.push({ kind: "group", id: `group-${anchor.id}`, anchor, members: [...runGroup], groupName });
    }
    runGroup = [];
    runPrefix = "";
  }

  for (const m of mutations) {
    const day = (m.occurred_at || m.recorded_at).slice(0, 10);

    if (runGroup.length === 0) {
      runGroup = [m];
      runPrefix = m.asset_id ? "" : displayName(m);
      continue;
    }

    const anchor = runGroup[0];
    const anchorDay = (anchor.occurred_at || anchor.recorded_at).slice(0, 10);

    if (m.action !== anchor.action || day !== anchorDay) {
      closeGroup();
      runGroup = [m];
      runPrefix = m.asset_id ? "" : displayName(m);
      continue;
    }

    if (anchor.asset_id !== null && m.asset_id !== null) {
      if (anchor.asset_id === m.asset_id) {
        runGroup.push(m);
      } else {
        closeGroup();
        runGroup = [m];
        runPrefix = "";
      }
    } else if (anchor.asset_id === null && m.asset_id === null) {
      const newPrefix = commonNamePrefix(runPrefix || displayName(anchor), displayName(m));
      if (newPrefix.length >= 3) {
        runPrefix = newPrefix;
        runGroup.push(m);
      } else {
        closeGroup();
        runGroup = [m];
        runPrefix = displayName(m);
      }
    } else {
      closeGroup();
      runGroup = [m];
      runPrefix = m.asset_id ? "" : displayName(m);
    }
  }

  closeGroup();
  return items;
}

function abbrevMoney(usdValue: number, displayCurrency: DisplayCurrency): string {
  const sym = displayCurrency === "USD" ? "$" : displayCurrency === "GBP" ? "£" : "€";
  if (usdValue >= 1_000_000) return `${sym}${(usdValue / 1_000_000).toFixed(1)}m`;
  return formatMoney(usdValue, "USD", displayCurrency);
}

function buildGroupAggregate(members: Mutation[], displayCurrency: DisplayCurrency): React.ReactNode {
  const action = members[0].action;
  // Convert each mutation's value to USD before summing across potentially different currencies.
  if (action === "remove") {
    const total = members.reduce((s, m) => s + toUsdClient(m.before_value ?? 0, m.currency || "USD"), 0);
    if (total === 0) return null;
    return (
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--negative-text)" }}>
        −{abbrevMoney(total, displayCurrency)}
      </span>
    );
  }
  if (action === "add") {
    const total = members.reduce((s, m) => s + toUsdClient(m.after_value ?? 0, m.currency || "USD"), 0);
    if (total === 0) return null;
    return (
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--positive-text)" }}>
        +{abbrevMoney(total, displayCurrency)}
      </span>
    );
  }
  const netDelta = members.reduce((s, m) => {
    if (m.before_value == null || m.after_value == null) return s;
    const cur = m.currency || "USD";
    return s + toUsdClient(m.after_value - m.before_value, cur);
  }, 0);
  if (netDelta === 0) return null;
  return (
    <span style={{ fontSize: 13, fontWeight: 500, color: netDelta >= 0 ? "var(--positive-text)" : "var(--negative-text)" }}>
      {netDelta >= 0 ? "+" : "−"}{abbrevMoney(Math.abs(netDelta), displayCurrency)}
    </span>
  );
}

// ── Shared row template ────────────────────────────────────────────────────────

function DiaryRowContent({
  logo, name, nameColor, valueNode, date,
  contextText, isContextExpanded, subtitle, footer,
}: {
  logo: React.ReactNode;
  name: string;
  nameColor: string;
  valueNode: React.ReactNode;
  date: string;
  contextText: string | null;
  isContextExpanded: boolean;
  subtitle?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "8px 0", alignItems: "flex-start" }}>
      {logo}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title line: name (flex) + right cluster (no-wrap) */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, color: nameColor }}>
            {name}
          </span>
          <span style={{ flexShrink: 0, display: "flex", alignItems: "baseline", gap: 6 }}>
            {valueNode}
            <span style={{ fontSize: 12, color: "var(--text-faint)", fontFeatureSettings: '"tnum" 1', whiteSpace: "nowrap" }}>
              {formatDate(date)}
            </span>
          </span>
        </div>
        {subtitle}
        {contextText && (
          <div
            className="font-serif"
            style={{
              fontStyle: "italic", fontSize: 13,
              color: "var(--text-dim)", lineHeight: 1.4,
              fontVariationSettings: "'opsz' 14",
              ...(isContextExpanded
                ? {}
                : {
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitBoxOrient: "vertical",
                    WebkitLineClamp: 2,
                  }),
            }}
          >
            {contextText === STARTING_POSITION_CTX ? "Started tracking from today." : contextText}
          </div>
        )}
        {footer}
      </div>
    </div>
  );
}

interface DiaryTabProps {
  mutations: Mutation[];
  hasMore?: boolean;
  onLoadMore?: () => void;
}

type PeriodKey = "all" | "week" | "month" | "3months" | "year" | "custom";

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "week", label: "1W" },
  { key: "month", label: "1M" },
  { key: "3months", label: "3M" },
  { key: "year", label: "1Y" },
  { key: "custom", label: "Custom" },
];

const SELECT_STYLE: React.CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  background: "var(--surface)",
  backgroundColor: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "5px 24px 5px 10px",
  fontSize: 13,
  fontFamily: "var(--font-sans)",
  color: "var(--text-dim)",
  cursor: "pointer",
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2354545E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 8px center",
  outline: "none",
};

function getMonthOptions(mutations: Mutation[]) {
  const dates = mutations
    .map((m) => m.occurred_at || m.recorded_at)
    .filter(Boolean)
    .map((d) => new Date(d!));

  const earliest = dates.length > 0
    ? new Date(Math.min(...dates.map((d) => d.getTime())))
    : new Date();

  const options: { label: string; value: string }[] = [];
  const now = new Date();
  let d = new Date(now.getFullYear(), now.getMonth(), 1);
  const stop = new Date(earliest.getFullYear(), earliest.getMonth(), 1);

  while (d >= stop) {
    options.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
    });
    d = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  }

  return options;
}

function isInPeriod(m: Mutation, period: PeriodKey, customFrom: string, customTo: string): boolean {
  if (period === "all") return true;
  const dateStr = m.occurred_at || m.recorded_at;
  if (!dateStr) return true;
  const date = new Date(dateStr);
  const now = new Date();

  switch (period) {
    case "week": return date >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "month": return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    case "3months": return date >= new Date(now.getFullYear(), now.getMonth() - 3, 1);
    case "year": return date.getFullYear() === now.getFullYear();
    case "custom": {
      let from = customFrom, to = customTo;
      if (from && to && from > to) [from, to] = [to, from];
      if (from && date < new Date(from + "-01")) return false;
      if (to) {
        const toDate = new Date(to + "-01");
        toDate.setMonth(toDate.getMonth() + 1);
        if (date >= toDate) return false;
      }
      return true;
    }
  }
}

function getPeriodLabel(period: PeriodKey, customFrom: string, customTo: string): string {
  const now = new Date();
  const fmtDate = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-GB", opts);
  switch (period) {
    case "week": return "last 7 days";
    case "month": return fmtDate(now, { month: "long", year: "numeric" });
    case "3months": {
      const from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      return `${fmtDate(from, { month: "short" })} – ${fmtDate(now, { month: "short", year: "numeric" })}`;
    }
    case "year": return String(now.getFullYear());
    case "custom": {
      let from = customFrom, to = customTo;
      if (from && to && from > to) [from, to] = [to, from];
      const f = from ? fmtDate(new Date(from + "-01"), { month: "short", year: "numeric" }) : "";
      const t = to ? fmtDate(new Date(to + "-01"), { month: "short", year: "numeric" }) : "";
      return f === t ? f : `${f} – ${t}`;
    }
    default: return "";
  }
}

// ── AI Summary card ────────────────────────────────────────────────────────────
function PeriodHighlight({ mutations, period, customFrom, customTo }: {
  mutations: Mutation[];
  period: PeriodKey;
  customFrom: string;
  customTo: string;
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const summaryKey = useMemo(() => mutations.map((m) => m.id).join(","), [mutations]);
  const periodLabel = getPeriodLabel(period, customFrom, customTo);

  useEffect(() => {
    if (mutations.length === 0) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    setSummary(null);
    setSummaryError(null);
    setSummaryLoading(true);

    fetch("/api/diary-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        mutations: mutations.map((m) => ({
          action: m.action,
          asset_name: m.asset?.name ?? m.asset_name,
          before_value: m.before_value,
          after_value: m.after_value,
          currency: m.currency,
          occurred_at: m.occurred_at,
          personal_context: m.personal_context,
        })),
        startVal: 0,
        endVal: 0,
        periodLabel,
      }),
    })
      .then(async (r) => {
        if (!r.ok) {
          if (r.status === 429) throw new Error("rate-limit");
          throw new Error("fetch-failed");
        }
        return r.json();
      })
      .then((d) => {
        clearTimeout(timeout);
        if (controller.signal.aborted) return;
        setSummary(d.summary || null);
        setSummaryLoading(false);
      })
      .catch((err) => {
        clearTimeout(timeout);
        if (controller.signal.aborted) return;
        if (err.message === "rate-limit") {
          setSummaryError("Daily summary limit reached. Resets tomorrow.");
        } else if (err.message !== "AbortError") {
          setSummaryError("Couldn't generate summary right now.");
        }
        setSummaryLoading(false);
      });

    return () => { controller.abort(); clearTimeout(timeout); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryKey]);

  if (mutations.length === 0) return null;
  if (!summaryLoading && !summary && !summaryError) return null;

  const adds = mutations.filter((m) => m.action === "add").length;
  const edits = mutations.filter((m) => m.action === "edit").length;
  const removes = mutations.filter((m) => m.action === "remove").length;
  const activityStr = [
    adds > 0 ? `${adds} added` : null,
    edits > 0 ? `${edits} updated` : null,
    removes > 0 ? `${removes} removed` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div
      className="bg-surface rounded-2xl border border-border mb-5"
      style={{ padding: "16px 20px" }}
    >
      <style>{`
        @keyframes volnarPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>

      {summaryLoading ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "8px 0" }}>
          <div
            style={{
              width: 32, height: 32, borderRadius: 9,
              background: "var(--accent-soft)",
              border: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: "volnarPulse 1.6s ease-in-out infinite",
            }}
          >
            <span
              className="font-serif text-accent"
              style={{ fontSize: 18, fontWeight: 400, fontVariationSettings: "'opsz' 144", lineHeight: 1 }}
            >
              V
            </span>
          </div>
          <span
            style={{ fontSize: 12, color: "var(--text-faint)", letterSpacing: "0.04em" }}
          >
            Reading the period…
          </span>
        </div>
      ) : summaryError ? (
        <div style={{ fontSize: 13, color: "var(--text-faint)", lineHeight: 1.5, padding: "4px 0" }}>
          {summaryError}
        </div>
      ) : (
        <>
          <ul style={{ paddingLeft: 0, listStyle: "none" }}>
            {(summary ?? "").split("\n").filter(l => l.trim()).map((line, i) => (
              <li
                key={i}
                style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.55, marginBottom: i < (summary ?? "").split("\n").filter(l => l.trim()).length - 1 ? 6 : 0 }}
              >
                {line.replace(/^•\s*/, "• ")}
              </li>
            ))}
          </ul>
          {activityStr && (
            <div
              className="font-mono uppercase"
              style={{ fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.14em", marginTop: 12 }}
            >
              {activityStr}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function DiaryTab({ mutations, hasMore, onLoadMore }: DiaryTabProps) {
  const displayCurrency = useDisplayCurrency();
  const router = useRouter();
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [customFrom, setCustomFrom] = useState(thisMonth);
  const [customTo, setCustomTo] = useState(thisMonth);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Anniversary: same MM-DD as today, at least 30 days in the past, oldest wins
  const anniversaryEntry = (() => {
    const month = now.getMonth(), day = now.getDate();
    const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    const candidates = mutations.filter(hasContent).filter((m) => {
      if (!m.occurred_at) return false;
      const [y, mo, d] = m.occurred_at.split("-").map(Number);
      return (mo - 1) === month && d === day && new Date(y, mo - 1, d).getTime() <= cutoff;
    });
    if (candidates.length === 0) return null;
    const m = [...candidates].sort((a, b) => a.occurred_at!.localeCompare(b.occurred_at!))[0];
    const [y, mo, d] = m.occurred_at!.split("-").map(Number);
    return { mutation: m, date: new Date(y, mo - 1, d) };
  })();

  const periodMutations = mutations
    .filter(hasContent)
    .filter((m) => isInPeriod(m, period, customFrom, customTo));

  const trimmedQuery = searchQuery.trim().toLowerCase();

  const filteredMutations = periodMutations
    .filter((m) => {
      if (!trimmedQuery) return true;
      return (
        displayName(m).toLowerCase().includes(trimmedQuery) ||
        (m.symbol ?? "").toLowerCase().includes(trimmedQuery) ||
        (m.personal_context ?? "").toLowerCase().includes(trimmedQuery)
      );
    });

  function jumpToEntry(m: Mutation) {
    const inTimeline = filteredMutations.some((fm) => fm.id === m.id);
    if (!inTimeline) {
      flushSync(() => {
        setPeriod("all");
        setSearchQuery("");
      });
    }
    const el = document.getElementById(`diary-entry-${m.id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(m.id);
    setTimeout(() => setHighlightedId(null), 1500);
  }

  const grouped = filteredMutations.reduce((acc, m) => {
    const key = getMonthKey(m.occurred_at || m.recorded_at);
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {} as Record<string, Mutation[]>);

  const monthKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  for (const key of monthKeys) {
    grouped[key].sort((a, b) => {
      const dayA = a.occurred_at ?? a.recorded_at;
      const dayB = b.occurred_at ?? b.recorded_at;
      if (dayA !== dayB) return dayB.localeCompare(dayA);
      return b.recorded_at.localeCompare(a.recorded_at);
    });
  }

  const monthOptions = getMonthOptions(mutations);

  return (
    <>
      <style>{`
        @keyframes diaryHighlight {
          0%   { outline: 2px solid rgba(212,165,116,0.75); outline-offset: 2px; border-radius: 6px; }
          100% { outline: 2px solid rgba(212,165,116,0);    outline-offset: 2px; border-radius: 6px; }
        }
        .diary-row { cursor: pointer; }
        .diary-row:hover { background-color: var(--surface-elev); }
        .diary-row:active { opacity: 0.7; }
      `}</style>

      {/* Page title */}
      <div style={{ marginBottom: 18 }}>
        <h1
          className="font-serif"
          style={{
            fontSize: 38, fontWeight: 500, letterSpacing: "-0.025em",
            color: "var(--hero)", lineHeight: 1,
            fontVariationSettings: "'opsz' 60",
          }}
        >
          Diary
        </h1>
      </div>

      {/* Search input */}
      <div style={{ position: "relative", marginBottom: 18 }}>
        <svg
          viewBox="0 0 256 256"
          fill="none"
          stroke="currentColor"
          strokeWidth="14"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            position: "absolute", top: "50%", left: 14,
            transform: "translateY(-50%)",
            width: 18, height: 18,
            color: "var(--text-faint)",
            pointerEvents: "none",
          }}
        >
          <circle cx="116" cy="116" r="84" />
          <line x1="175.39" y1="175.39" x2="224" y2="224" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search asml, april, removed…"
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "12px 36px 12px 42px",
            fontSize: 15,
            fontFamily: "var(--font-sans)",
            color: "var(--text)",
            outline: "none",
            caretColor: "var(--accent)",
            transition: "border-color 0.15s",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            aria-label="Clear search"
            style={{
              position: "absolute", right: 12, top: "50%",
              transform: "translateY(-50%)",
              background: "none", border: "none", padding: 0,
              cursor: "pointer", color: "var(--text-faint)",
              fontSize: 16, lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Period chip row */}
      <div
        className="flex items-center gap-1.5 mb-2 [&::-webkit-scrollbar]:hidden"
        style={{ overflowX: "auto", scrollbarWidth: "none", flexWrap: "nowrap" }}
      >
        {PERIOD_OPTIONS.map(({ key, label }) => {
          const active = period === key;
          return (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              style={{
                fontSize: 13,
                padding: "6px 14px",
                borderRadius: 999,
                border: `1px solid ${active ? "var(--border-strong)" : "var(--border)"}`,
                background: active ? "var(--surface-elev)" : "transparent",
                color: active ? "var(--text)" : "var(--text-faint)",
                whiteSpace: "nowrap",
                flexShrink: 0,
                fontFamily: "var(--font-sans)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Custom date range picker */}
      {period === "custom" && (
        <div className="flex items-center gap-1.5 mb-3" style={{ paddingLeft: 2 }}>
          <select
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            style={SELECT_STYLE}
          >
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span style={{ fontSize: 13, color: "var(--text-faint)" }}>to</span>
          <select
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            style={SELECT_STYLE}
          >
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* AI summary card — shown when a non-all period is active */}
      {period !== "all" && (
        <>
          {/* Period label */}
          <div
            className="font-mono uppercase"
            style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--text-faint)", marginTop: 4, marginBottom: 10 }}
          >
            {getPeriodLabel(period, customFrom, customTo)}
          </div>
          <PeriodHighlight
            mutations={periodMutations}
            period={period}
            customFrom={customFrom}
            customTo={customTo}
          />
        </>
      )}

      {/* On this day — full-bleed accent-soft band */}
      {anniversaryEntry && (
        <button
          onClick={() => jumpToEntry(anniversaryEntry.mutation)}
          className="-mx-4 sm:-mx-8 mb-[18px]"
          style={{
            display: "block",
            textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer",
            position: "relative", width: "auto",
          }}
        >
          <div
            style={{ position: "relative", background: "var(--accent-soft)" }}
            className="px-4 sm:px-8 py-[14px]"
          >
            <div
              style={{
                fontSize: 10, fontWeight: 500, letterSpacing: "0.18em",
                textTransform: "uppercase", color: "var(--accent-text)", opacity: 0.7,
                marginBottom: 6,
              }}
            >
              Worth knowing
            </div>
            <div
              className="font-serif"
              style={{
                fontSize: 16, fontWeight: 400, lineHeight: 1.35,
                color: "var(--text)", fontVariationSettings: "'opsz' 18",
              }}
            >
              <span>{relativeAge(anniversaryEntry.date, now)} you </span>
              <span>{anniversaryEntry.mutation.action === "add"
                ? (anniversaryEntry.mutation.personal_context === STARTING_POSITION_CTX ? "started tracking" : "added")
                : anniversaryEntry.mutation.action === "remove" ? "removed" : "edited"} </span>
              <span style={{ fontStyle: "italic" }}>{displayName(anniversaryEntry.mutation)}</span>
              {anniversaryEntry.mutation.personal_context && anniversaryEntry.mutation.personal_context !== STARTING_POSITION_CTX && (
                <span style={{ fontStyle: "italic", color: "var(--text-dim)" }}> — {anniversaryEntry.mutation.personal_context}</span>
              )}
            </div>
            {/* Chevron */}
            <svg
              viewBox="0 0 256 256"
              fill="none"
              stroke="currentColor"
              strokeWidth="20"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                position: "absolute", top: 18, right: 22,
                width: 12, height: 12,
                color: "var(--accent-text)", opacity: 0.5,
              }}
            >
              <polyline points="96 48 176 128 96 208" />
            </svg>
          </div>
        </button>
      )}

      {/* Empty state */}
      {filteredMutations.length === 0 && (
        <div className="text-center pt-16">
          {trimmedQuery ? (
            <>
              <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 8 }}>
                No entries match &ldquo;{searchQuery.trim()}&rdquo;
              </div>
              <p style={{ fontSize: 12, color: "var(--text-faint)" }}>Try a different search term.</p>
            </>
          ) : (
            <>
              <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 8 }}>No entries for this period</div>
              <p style={{ fontSize: 12, color: "var(--text-faint)" }}>Try a different time range.</p>
            </>
          )}
        </div>
      )}

      {/* Timeline — month-bucketed entry list */}
      {monthKeys.map((monthKey) => {
        const monthItems = buildDisplayItems(grouped[monthKey], !!trimmedQuery);
        return (
          <div key={monthKey}>
            {/* Month header */}
            <div
              style={{
                display: "flex", alignItems: "baseline", justifyContent: "space-between",
                margin: "22px 0 12px",
              }}
            >
              <div
                className="font-serif"
                style={{
                  fontSize: 22, fontWeight: 500, color: "var(--text)",
                  letterSpacing: "-0.01em", fontVariationSettings: "'opsz' 24",
                }}
              >
                {getMonthLabel(monthKey)}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
                {grouped[monthKey].length} {grouped[monthKey].length === 1 ? "entry" : "entries"}
              </div>
            </div>

            {/* Entry rows */}
            <div>
              {monthItems.map((item) => {
                if (item.kind === "singleton") {
                  const m = item.mutation;
                  const date = m.occurred_at || m.recorded_at;
                  const valueNode = buildValueNode(m, displayCurrency);
                  const name = displayName(m);
                  const isRemovedAsset = !m.asset_id;
                  const isExpanded = expandedIds.has(m.id);

                  return (
                    <div
                      key={m.id}
                      id={`diary-entry-${m.id}`}
                      onClick={() => {
                        if (m.asset_id) {
                          router.push(`/asset/${m.asset_id}`);
                        } else {
                          setExpandedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(m.id)) next.delete(m.id);
                            else next.add(m.id);
                            return next;
                          });
                        }
                      }}
                      className="diary-row last:border-0"
                      style={{
                        borderBottom: "0.5px solid var(--border)",
                        ...(highlightedId === m.id ? { animation: "diaryHighlight 1.5s ease-out forwards" } : {}),
                      }}
                    >
                      <DiaryRowContent
                        logo={<div style={{ opacity: isRemovedAsset ? 0.7 : 1, flexShrink: 0 }}><AssetLogo type={m.asset_type} symbol={m.symbol} name={name} size={28} /></div>}
                        name={name}
                        nameColor={isRemovedAsset ? "var(--text-dim)" : "var(--text)"}
                        valueNode={valueNode}
                        date={date}
                        contextText={m.personal_context ?? null}
                        isContextExpanded={isExpanded}
                      />
                    </div>
                  );
                }

                // Group summary + children
                const { id: groupId, anchor, members, groupName } = item;
                const isGroupExpanded = expandedGroups.has(groupId);
                const isRemovedGroup = !anchor.asset_id;
                const anchorDate = anchor.occurred_at || anchor.recorded_at;
                const anchorContext = members.find((m) => !!m.personal_context)?.personal_context ?? null;
                const groupAggNode = buildGroupAggregate(members, displayCurrency);
                const verb = actionVerb(anchor.action);

                return (
                  <Fragment key={groupId}>
                    {/* Summary row */}
                    <div
                      id={`diary-entry-${anchor.id}`}
                      onClick={() => setExpandedGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(groupId)) next.delete(groupId);
                        else next.add(groupId);
                        return next;
                      })}
                      className="diary-row last:border-0"
                      style={{
                        borderBottom: "0.5px solid var(--border)",
                        ...(highlightedId === anchor.id ? { animation: "diaryHighlight 1.5s ease-out forwards" } : {}),
                      }}
                    >
                      <DiaryRowContent
                        logo={<div style={{ opacity: isRemovedGroup ? 0.7 : 1, flexShrink: 0 }}><AssetLogo type={anchor.asset_type} symbol={anchor.symbol} name={displayName(anchor)} size={28} /></div>}
                        name={groupName}
                        nameColor={isRemovedGroup ? "var(--text-dim)" : "var(--text)"}
                        valueNode={groupAggNode}
                        date={anchorDate}
                        contextText={anchorContext}
                        isContextExpanded={false}
                        subtitle={
                          <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.3, marginBottom: anchorContext ? 2 : 0 }}>
                            · {members.length} {verb}
                          </div>
                        }
                        footer={
                          <div style={{ marginTop: anchorContext ? 4 : 2, fontSize: 12, color: "var(--text-faint)" }}>
                            {isGroupExpanded ? "↑ Hide" : `↓ Show all ${members.length} entries`}
                          </div>
                        }
                      />
                    </div>

                    {/* Expanded child rows */}
                    {isGroupExpanded && members.map((m) => {
                      const date = m.occurred_at || m.recorded_at;
                      const valueNode = buildValueNode(m, displayCurrency);
                      return (
                        <div
                          key={m.id}
                          id={`diary-entry-${m.id}`}
                          onClick={() => {
                            if (m.asset_id) {
                              router.push(`/asset/${m.asset_id}`);
                            } else {
                              setExpandedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(m.id)) next.delete(m.id);
                                else next.add(m.id);
                                return next;
                              });
                            }
                          }}
                          className="diary-row last:border-0"
                          style={{ borderBottom: "0.5px solid var(--border)" }}
                        >
                          <div style={{ display: "flex", gap: 10, padding: "5px 0 5px 38px", alignItems: "baseline" }}>
                            <span style={{ flex: 1 }}>{valueNode}</span>
                            <span
                              style={{
                                fontSize: 12, color: "var(--text-faint)",
                                fontFeatureSettings: '"tnum" 1', flexShrink: 0,
                              }}
                            >
                              {formatDate(date)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </Fragment>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Load more */}
      {hasMore && onLoadMore && (
        <div className="pt-4 pb-8 flex justify-center">
          <button
            onClick={onLoadMore}
            style={{
              fontSize: 13, color: "var(--text-faint)", fontFamily: "var(--font-sans)",
              background: "none", border: "none", cursor: "pointer",
            }}
          >
            Load more
          </button>
        </div>
      )}
    </>
  );
}

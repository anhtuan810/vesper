"use client";

import { useState, useEffect, useMemo } from "react";
import { flushSync } from "react-dom";
import { formatDate, getMonthKey, getMonthLabel } from "@/lib/utils";
import { useDisplayCurrency } from "@/lib/hooks";
import { formatMoney, type DisplayCurrency } from "@/lib/money";
import type { Mutation } from "@/lib/supabase";
import { AssetLogo } from "@/components/AssetLogo";

const TRADEABLE_TYPES = new Set(["stocks", "etf", "crypto", "gold"]);

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
      return <span className="font-mono" style={{ fontSize: 11, fontWeight: 500, flexShrink: 0, color: "var(--positive)" }}>+{m.after_units.toLocaleString()} {noun}</span>;
    }
    if (m.action === "edit") {
      const delta = (m.after_units ?? 0) - (m.before_units ?? 0);
      if (delta !== 0) return <span className="font-mono" style={{ fontSize: 11, fontWeight: 500, flexShrink: 0, color: delta >= 0 ? "var(--positive)" : "var(--negative)" }}>{delta >= 0 ? "+" : ""}{delta.toLocaleString()} {noun}</span>;
    }
    if (m.action === "remove" && m.before_units != null) {
      return <span className="font-mono" style={{ fontSize: 11, flexShrink: 0, color: "var(--negative)", textDecoration: "line-through" }}>{m.before_units.toLocaleString()} {noun}</span>;
    }
  }

  if (m.action === "add" && m.after_value != null) {
    return <span className="font-mono" style={{ fontSize: 11, fontWeight: 500, flexShrink: 0, color: "var(--positive)" }}>{formatMoney(m.after_value, displayCurrency)}</span>;
  }
  if (m.action === "edit") {
    const valDelta = m.before_value != null && m.after_value != null ? m.after_value - m.before_value : null;
    if (valDelta !== null && valDelta !== 0) return <span className="font-mono" style={{ fontSize: 11, fontWeight: 500, flexShrink: 0, color: valDelta >= 0 ? "var(--positive)" : "var(--negative)" }}>{valDelta >= 0 ? "+" : ""}{formatMoney(valDelta, displayCurrency)}</span>;
    if (m.after_value != null) return <span className="font-mono" style={{ fontSize: 11, fontWeight: 500, flexShrink: 0, color: "var(--text-dim)" }}>{formatMoney(m.after_value, displayCurrency)}</span>;
  }
  if (m.action === "remove" && m.before_value != null) {
    return <span className="font-mono" style={{ fontSize: 11, flexShrink: 0, color: "var(--negative)", textDecoration: "line-through" }}>{formatMoney(m.before_value, displayCurrency)}</span>;
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

// ── Inline note editor ─────────────────────────────────────────────────────────
function NoteEditor({
  mutationId,
  initialNote,
  onOptimistic,
  onSaved,
  onRevert,
  onCancel,
}: {
  mutationId: string;
  initialNote: string;
  onOptimistic: (note: string) => void;
  onSaved: () => void;
  onRevert: (prevNote: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const prevNote = initialNote;
    setSaving(true);
    setError(null);
    onOptimistic(draft);
    try {
      const res = await fetch(`/api/mutations/${mutationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personal_context: draft }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Save failed");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      onRevert(prevNote);
      setSaving(false);
    }
  }

  return (
    <div style={{ marginLeft: 36, paddingBottom: 14 }}>
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={saving}
        placeholder="Add a personal note…"
        rows={3}
        style={{
          width: "100%",
          background: "var(--surface-elev)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "6px 8px",
          fontSize: 11,
          fontStyle: "italic",
          color: "var(--text-dim)",
          lineHeight: 1.45,
          resize: "vertical",
          outline: "none",
          boxSizing: "border-box",
          fontFamily: "inherit",
          opacity: saving ? 0.6 : 1,
        }}
      />
      {error && (
        <div
          className="font-mono"
          style={{ fontSize: 10, color: "var(--negative)", marginTop: 4 }}
        >
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className="font-mono transition-all"
          style={{
            fontSize: 11,
            padding: "4px 10px",
            borderRadius: 6,
            border: "1px solid var(--border-strong)",
            background: "var(--surface-elev)",
            color: saving ? "var(--text-faint)" : "var(--text)",
            cursor: saving ? "default" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="font-mono transition-all"
          style={{
            fontSize: 11,
            padding: "4px 10px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text-faint)",
            cursor: saving ? "default" : "pointer",
          }}
        >
          Cancel
        </button>
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
  { key: "all", label: "ALL" },
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
  fontSize: 11,
  fontFamily: "var(--mono)",
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
      if (customFrom && date < new Date(customFrom + "-01")) return false;
      if (customTo) {
        const to = new Date(customTo + "-01");
        to.setMonth(to.getMonth() + 1);
        if (date >= to) return false;
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
      const f = customFrom ? fmtDate(new Date(customFrom + "-01"), { month: "short", year: "numeric" }) : "";
      const t = customTo ? fmtDate(new Date(customTo + "-01"), { month: "short", year: "numeric" }) : "";
      return f === t ? f : `${f} – ${t}`;
    }
    default: return "";
  }
}

// ── Period highlight — AI summary only ────────────────────────────────────────
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
          asset_name: m.asset_name,
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
    <div className="bg-surface rounded-2xl border border-border p-4 mb-4">
      <style>{`
        @keyframes vesperPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>

      {summaryLoading ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "4px 0" }}>
          <div
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: "var(--accent-soft)",
              border: "1px solid rgba(212,165,116,0.18)",
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: "vesperPulse 1.6s ease-in-out infinite",
            }}
          >
            <span className="font-serif text-accent" style={{ fontSize: 16, fontWeight: 400, fontVariationSettings: "'opsz' 144" }}>V</span>
          </div>
          <span className="font-mono text-faint italic" style={{ fontSize: 10, letterSpacing: "0.04em" }}>
            Reading the period...
          </span>
        </div>
      ) : summaryError ? (
        <div className="font-mono text-faint italic" style={{ fontSize: 11, lineHeight: 1.4, padding: "4px 0" }}>
          {summaryError}
        </div>
      ) : (
        <>
          <ul className="space-y-1">
            {(summary ?? "").split("\n").filter(l => l.trim()).map((line, i) => (
              <li key={i} className="text-dim leading-snug" style={{ fontSize: 12 }}>
                {line.replace(/^•\s*/, "• ")}
              </li>
            ))}
          </ul>
          {activityStr && (
            <div className="font-mono uppercase text-faint mt-2" style={{ fontSize: 10, letterSpacing: "0.12em" }}>
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
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [customFrom, setCustomFrom] = useState(thisMonth);
  const [customTo, setCustomTo] = useState(thisMonth);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [localContexts, setLocalContexts] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  function getContext(m: Mutation): string {
    return m.id in localContexts ? localContexts[m.id] : (m.personal_context ?? "");
  }

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
        (m.asset_name ?? "").toLowerCase().includes(trimmedQuery) ||
        (m.symbol ?? "").toLowerCase().includes(trimmedQuery) ||
        getContext(m).toLowerCase().includes(trimmedQuery)
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
      {/* Period highlight chart */}
      {period !== "all" && (
        <PeriodHighlight
          mutations={periodMutations}
          period={period}
          customFrom={customFrom}
          customTo={customTo}
        />
      )}

      {/* Period label */}
      {period !== "all" && (
        <div className="font-mono uppercase text-faint" style={{ fontSize: 10, letterSpacing: "0.18em", marginBottom: 8 }}>
          {getPeriodLabel(period, customFrom, customTo)}
        </div>
      )}

      {/* Search input */}
      <div style={{ position: "relative", marginBottom: 8 }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search entries"
          className="font-mono"
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "5px 28px 5px 10px",
            fontSize: 11,
            color: "var(--text)",
            outline: "none",
            caretColor: "var(--accent)",
          }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            aria-label="Clear search"
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "var(--text-faint)",
              fontSize: 14,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Row A — period chips */}
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
              className="font-mono transition-all"
              style={{
                fontSize: 11,
                padding: "5px 10px",
                borderRadius: 8,
                border: `1px solid ${active ? "var(--border-strong)" : "var(--border)"}`,
                background: active ? "var(--surface-elev)" : "transparent",
                color: active ? "var(--text)" : "var(--text-faint)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Custom date range picker — shown below chips when Custom is active */}
      {period === "custom" && (
        <div className="flex items-center gap-1.5 mb-2" style={{ paddingLeft: 2 }}>
          <select
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            style={SELECT_STYLE}
          >
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className="font-mono text-faint" style={{ fontSize: 11 }}>to</span>
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

      <style>{`
        @keyframes diaryHighlight {
          0%   { outline: 2px solid rgba(212,165,116,0.75); outline-offset: 1px; }
          100% { outline: 2px solid rgba(212,165,116,0);    outline-offset: 1px; }
        }
      `}</style>

      {/* On this day */}
      {anniversaryEntry && (
        <div className="bg-surface rounded-2xl border border-border p-4 mb-6">
          <div
            className="font-serif italic text-dim mb-3"
            style={{ fontSize: 13, fontVariationSettings: "'opsz' 144" }}
          >
            On this day
          </div>
          <button
            onClick={() => jumpToEntry(anniversaryEntry.mutation)}
            style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            <div className="flex items-center gap-3">
              <AssetLogo
                type={anniversaryEntry.mutation.asset_type}
                symbol={anniversaryEntry.mutation.symbol}
                name={anniversaryEntry.mutation.asset_name}
              />
              <span
                className="font-sans flex-1 min-w-0"
                style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {anniversaryEntry.mutation.asset_name}
              </span>
              {buildValueNode(anniversaryEntry.mutation, displayCurrency)}
              <span
                className="font-mono uppercase"
                style={{ fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.12em", flexShrink: 0, marginLeft: 12 }}
              >
                {formatDate(anniversaryEntry.mutation.occurred_at || anniversaryEntry.mutation.recorded_at)}
              </span>
            </div>
            {getContext(anniversaryEntry.mutation) && (
              <div
                className="italic"
                style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 3, marginLeft: 36 }}
              >
                {getContext(anniversaryEntry.mutation)}
              </div>
            )}
          </button>
          <div className="font-mono uppercase text-faint mt-3" style={{ fontSize: 10, letterSpacing: "0.12em" }}>
            {relativeAge(anniversaryEntry.date, now)}
          </div>
        </div>
      )}

      {/* Empty state */}
      {filteredMutations.length === 0 && (
        <div className="text-center pt-16">
          {trimmedQuery ? (
            <>
              <div className="text-sm text-dim mb-2">No entries match &ldquo;{searchQuery.trim()}&rdquo;</div>
              <p className="text-faint text-xs">Try a different search term.</p>
            </>
          ) : (
            <>
              <div className="text-sm text-dim mb-2">No entries for this period</div>
              <p className="text-faint text-xs">Try a different time range.</p>
            </>
          )}
        </div>
      )}

      {/* Timeline */}
      {monthKeys.map((monthKey) => (
        <div key={monthKey} className="mb-8">
          <div className="font-mono uppercase text-faint mb-3" style={{ fontSize: 10, letterSpacing: "0.18em" }}>
            {getMonthLabel(monthKey)} · {grouped[monthKey].length} {grouped[monthKey].length === 1 ? "entry" : "entries"}
          </div>

          <div>
            {grouped[monthKey].map((m) => {
              const date = m.occurred_at || m.recorded_at;
              const valueNode = buildValueNode(m, displayCurrency);
              const context = getContext(m);
              const isExpanded = expandedId === m.id;

              return (
                <div
                  key={m.id}
                  id={`diary-entry-${m.id}`}
                  className="border-b border-border last:border-0"
                  style={highlightedId === m.id ? { animation: "diaryHighlight 1.5s ease-out forwards" } : undefined}
                >
                  {/* Clickable row — tap to toggle note editor */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : m.id)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      padding: "14px 0",
                      cursor: "pointer",
                    }}
                  >
                    {/* ROW 1: icon · name · value · date */}
                    <div className="flex items-center gap-3">
                      <AssetLogo type={m.asset_type} symbol={m.symbol} name={m.asset_name} />
                      <span
                        className="font-sans flex-1 min-w-0"
                        style={{
                          fontSize: 14, fontWeight: 500,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}
                      >
                        {m.asset_name}
                      </span>
                      {valueNode}
                      <span
                        className="font-mono uppercase"
                        style={{ fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.12em", flexShrink: 0, marginLeft: 12 }}
                      >
                        {formatDate(date)}
                      </span>
                    </div>

                    {/* ROW 2: context note or "+ Add note" affordance */}
                    {context ? (
                      <div
                        className="italic"
                        style={{
                          fontSize: 11, color: "var(--text-dim)", lineHeight: 1.45,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          marginTop: 3, marginLeft: 36,
                        }}
                      >
                        {context}
                      </div>
                    ) : (
                      <div
                        className="font-mono"
                        style={{
                          fontSize: 10, color: "var(--text-faint)",
                          marginTop: 3, marginLeft: 36, letterSpacing: "0.04em",
                        }}
                      >
                        + Add note
                      </div>
                    )}
                  </button>

                  {/* Inline editor — rendered below the row when expanded */}
                  {isExpanded && (
                    <NoteEditor
                      mutationId={m.id}
                      initialNote={context}
                      onOptimistic={(note) =>
                        setLocalContexts((prev) => ({ ...prev, [m.id]: note }))
                      }
                      onSaved={() => setExpandedId(null)}
                      onRevert={(prevNote) =>
                        setLocalContexts((prev) => ({ ...prev, [m.id]: prevNote }))
                      }
                      onCancel={() => setExpandedId(null)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {hasMore && onLoadMore && (
        <div className="pt-4 pb-8 flex justify-center">
          <button
            onClick={onLoadMore}
            className="font-mono text-faint hover:text-dim transition-colors"
            style={{ fontSize: 11, letterSpacing: "0.08em" }}
          >
            Load more
          </button>
        </div>
      )}
    </>
  );
}

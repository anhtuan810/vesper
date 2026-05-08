"use client";

import { useState, useEffect, useMemo } from "react";
import { fmt, formatDate, getMonthKey, getMonthLabel } from "@/lib/utils";
import type { Mutation } from "@/lib/supabase";
import { AssetLogo } from "@/components/AssetLogo";

const TRADEABLE_TYPES = new Set(["stocks", "etf", "crypto", "gold"]);

function unitNoun(assetType: string | null): string {
  if (assetType === "crypto") return "units";
  if (assetType === "gold") return "oz";
  return "shares";
}


interface DiaryTabProps {
  mutations: Mutation[];
  diaryFilter: string;
  setDiaryFilter: (filter: string) => void;
}

type PeriodKey = "all" | "week" | "month" | "3months" | "year" | "custom";

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "3months", label: "Last 3M" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom" },
];

const ACTION_FILTERS: { label: string; value: string }[] = [
  { label: "All", value: "all" },
  { label: "Added", value: "add" },
  { label: "Updated", value: "edit" },
  { label: "Removed", value: "remove" },
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

  const summaryKey = useMemo(() => mutations.map((m) => m.id).join(","), [mutations]);
  const periodLabel = getPeriodLabel(period, customFrom, customTo);

  useEffect(() => {
    if (mutations.length === 0) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    setSummary(null);
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
        currency: "EUR",
      }),
    })
      .then((r) => r.json())
      .then((d) => { clearTimeout(timeout); if (!controller.signal.aborted) { setSummary(d.summary || null); setSummaryLoading(false); } })
      .catch(() => { clearTimeout(timeout); if (!controller.signal.aborted) setSummaryLoading(false); });

    return () => { controller.abort(); clearTimeout(timeout); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryKey]);

  if (mutations.length === 0) return null;
  if (!summaryLoading && !summary) return null;

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
export function DiaryTab({ mutations, diaryFilter, setDiaryFilter }: DiaryTabProps) {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [customFrom, setCustomFrom] = useState(thisMonth);
  const [customTo, setCustomTo] = useState(thisMonth);

  const hasContent = (m: Mutation) =>
    m.before_value != null || m.after_value != null || !!m.personal_context;

  const periodMutations = mutations
    .filter(hasContent)
    .filter((m) => isInPeriod(m, period, customFrom, customTo));

  const filteredMutations = periodMutations
    .filter((m) => diaryFilter === "all" || m.action === diaryFilter);

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

      {/* Row A — period chips */}
      <div
        className="flex items-center gap-1.5 mb-2"
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
        {period === "custom" && (
          <div className="flex items-center gap-1.5 ml-1" style={{ flexShrink: 0 }}>
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
      </div>

      {/* Row B — action filter pills */}
      <div className="flex gap-1.5 mb-6">
        {ACTION_FILTERS.map(({ label, value }) => {
          const active = diaryFilter === value;
          return (
            <button
              key={value}
              onClick={() => setDiaryFilter(value)}
              className="font-mono transition-all"
              style={{
                fontSize: 11,
                padding: "5px 10px",
                borderRadius: 8,
                border: `1px solid ${active ? "var(--border-strong)" : "var(--border)"}`,
                background: active ? "var(--surface-elev)" : "transparent",
                color: active ? "var(--text)" : "var(--text-faint)",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {filteredMutations.length === 0 && (
        <div className="text-center pt-16">
          <div className="text-sm text-dim mb-2">No entries for this period</div>
          <p className="text-faint text-xs">Try a different time range or filter.</p>
        </div>
      )}

      {/* Timeline */}
      {monthKeys.map((monthKey) => (
        <div key={monthKey} className="mb-8">
          {/* Month header — italic serif */}
          <div
            className="font-serif text-dim italic mb-3"
            style={{ fontSize: 13, fontVariationSettings: "'opsz' 144" }}
          >
            {getMonthLabel(monthKey)}
            <span className="font-mono not-italic text-faint ml-3" style={{ fontSize: 10 }}>
              {grouped[monthKey].length} {grouped[monthKey].length === 1 ? "entry" : "entries"}
            </span>
          </div>

          <div>
            {grouped[monthKey].map((m) => {
              const mCur = m.currency ?? "EUR";
              const date = m.occurred_at || m.recorded_at;

              // Unit-based display for tradeable mutations; value-based fallback for all others
              const isUnitEligible =
                m.asset_type != null &&
                TRADEABLE_TYPES.has(m.asset_type) &&
                (m.before_units != null || m.after_units != null);
              const noun = unitNoun(m.asset_type);

              let valueNode: React.ReactNode = null;

              if (isUnitEligible) {
                if (m.action === "add" && m.after_units != null) {
                  valueNode = (
                    <span className="font-mono" style={{ fontSize: 11, fontWeight: 500, flexShrink: 0, color: "var(--positive)" }}>
                      +{m.after_units.toLocaleString()} {noun}
                    </span>
                  );
                } else if (m.action === "edit") {
                  const unitDelta = (m.after_units ?? 0) - (m.before_units ?? 0);
                  if (unitDelta !== 0) {
                    valueNode = (
                      <span className="font-mono" style={{ fontSize: 11, fontWeight: 500, flexShrink: 0, color: unitDelta >= 0 ? "var(--positive)" : "var(--negative)" }}>
                        {unitDelta >= 0 ? "+" : ""}{unitDelta.toLocaleString()} {noun}
                      </span>
                    );
                  }
                  // zero delta falls through to value-based below
                } else if (m.action === "remove" && m.before_units != null) {
                  valueNode = (
                    <span className="font-mono" style={{ fontSize: 11, flexShrink: 0, color: "var(--negative)", textDecoration: "line-through" }}>
                      {m.before_units.toLocaleString()} {noun}
                    </span>
                  );
                }
              }

              // Value-based fallback (non-tradeable, historical without units, or edit with zero unit delta)
              if (valueNode === null) {
                if (m.action === "add" && m.after_value != null) {
                  valueNode = (
                    <span className="font-mono" style={{ fontSize: 11, fontWeight: 500, flexShrink: 0, color: "var(--positive)" }}>
                      {fmt(m.after_value, mCur)}
                    </span>
                  );
                } else if (m.action === "edit") {
                  const valDelta = m.before_value != null && m.after_value != null
                    ? m.after_value - m.before_value : null;
                  if (valDelta !== null && valDelta !== 0) {
                    valueNode = (
                      <span className="font-mono" style={{ fontSize: 11, fontWeight: 500, flexShrink: 0, color: valDelta >= 0 ? "var(--positive)" : "var(--negative)" }}>
                        {valDelta >= 0 ? "+" : ""}{fmt(valDelta, mCur)}
                      </span>
                    );
                  } else if (m.after_value != null) {
                    valueNode = (
                      <span className="font-mono" style={{ fontSize: 11, fontWeight: 500, flexShrink: 0, color: "var(--text-dim)" }}>
                        {fmt(m.after_value, mCur)}
                      </span>
                    );
                  }
                } else if (m.action === "remove" && m.before_value != null) {
                  valueNode = (
                    <span className="font-mono" style={{ fontSize: 11, flexShrink: 0, color: "var(--negative)", textDecoration: "line-through" }}>
                      {fmt(m.before_value, mCur)}
                    </span>
                  );
                }
              }

              return (
                <div key={m.id} className="py-3.5 border-b border-border last:border-0">
                  {/* ROW 1: icon · name · value · date */}
                  <div className="flex items-center gap-3">
                    <AssetLogo type={m.asset_type} symbol={m.symbol} name={m.asset_name} />
                    <span
                      className="font-serif flex-1 min-w-0"
                      style={{
                        fontSize: 14, fontWeight: 400, fontVariationSettings: "'opsz' 144",
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

                  {/* ROW 2: context note — single line, aligned under name */}
                  {m.personal_context && (
                    <div
                      className="italic"
                      style={{
                        fontSize: 11, color: "var(--text-dim)", lineHeight: 1.45,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        marginTop: 3, marginLeft: 36,
                      }}
                    >
                      {m.personal_context}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

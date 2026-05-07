"use client";

import { useState, useEffect, useMemo } from "react";
import { fmt, formatDate, getMonthKey, getMonthLabel, ACTION_STYLE, TYPE_COLOR, type DashboardMutation } from "@/lib/utils";
import { PriceDisplay } from "@/components/PriceDisplay";

// ── Asset icon ─────────────────────────────────────────────────────────────────
const TYPE_ICON: Record<string, React.ReactNode> = {
  real_estate: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
      <path d="M3 12L12 4L21 12V21H15V15H9V21H3V12Z" />
    </svg>
  ),
  gold: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
      <rect x="3" y="9" width="18" height="7" rx="1.5" />
      <path d="M7 9V7M12 9V6M17 9V7" />
    </svg>
  ),
  bonds: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8H16M8 12H16M8 16H12" />
    </svg>
  ),
  cash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
      <rect x="2" y="7" width="20" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 10V14M18 10V14" />
    </svg>
  ),
  pension: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
      <path d="M12 4C7.5 4 3.5 7.5 3 12H21C20.5 7.5 16.5 4 12 4Z" />
      <path d="M12 12V18C12 19.1 12.9 20 14 20C15.1 20 16 19.1 16 18" />
    </svg>
  ),
  crypto: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 8.5H13C14.1 8.5 15 9.4 15 10.5C15 11.6 14.1 12.5 13 12.5H9V8.5Z" />
      <path d="M9 12.5H13.5C14.6 12.5 15.5 13.4 15.5 14.5C15.5 15.6 14.6 16.5 13.5 16.5H9V12.5Z" />
      <path d="M11 8.5V7M11 17V18M13 8.5V7M13 17V18" />
    </svg>
  ),
  stocks: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
      <polyline points="4,17 9,11 14,14 20,7" />
      <path d="M4 20H20" />
    </svg>
  ),
  etf: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
      <rect x="3" y="13" width="4" height="8" rx="1" />
      <rect x="10" y="8" width="4" height="13" rx="1" />
      <rect x="17" y="4" width="4" height="17" rx="1" />
    </svg>
  ),
  other: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
};

function AssetIcon({ type, symbol }: { type: string | null; symbol: string | null }) {
  const [imgFailed, setImgFailed] = useState(false);
  const assetType = type || "other";
  const color = TYPE_COLOR[assetType] || TYPE_COLOR.other;

  const useLogoTypes = ["stocks", "etf", "crypto"];
  const logoSymbol = symbol
    ? symbol.replace(/-USD$/i, "").replace(/-EUR$/i, "").toUpperCase()
    : null;

  if (logoSymbol && useLogoTypes.includes(assetType) && !imgFailed) {
    return (
      <div className="w-6 h-6 rounded-md bg-surface border border-border overflow-hidden shrink-0 flex items-center justify-center">
        <img
          src={`https://assets.parqet.com/logos/symbol/${logoSymbol}?format=png`}
          alt={logoSymbol}
          className="w-full h-full object-contain"
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  // When we have a symbol but the logo failed, show the ticker as a monogram
  // instead of the generic crypto/stock SVG (which looks like BTC for all crypto)
  if (logoSymbol && imgFailed) {
    return (
      <div
        className="w-6 h-6 rounded-md shrink-0 flex items-center justify-center font-mono font-medium"
        style={{ background: `${color}18`, color, fontSize: 7, letterSpacing: "0.02em" }}
      >
        {logoSymbol.slice(0, 4)}
      </div>
    );
  }

  const icon = TYPE_ICON[assetType] || TYPE_ICON.other;
  return (
    <div
      className="w-6 h-6 rounded-md shrink-0 flex items-center justify-center"
      style={{ background: `${color}18`, color }}
    >
      {icon}
    </div>
  );
}

interface DiaryTabProps {
  mutations: DashboardMutation[];
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

function getMonthOptions(mutations: DashboardMutation[]) {
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

function isInPeriod(m: DashboardMutation, period: PeriodKey, customFrom: string, customTo: string): boolean {
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
    case "week": return "past 7 days";
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

// ── Period highlight card with SVG area chart ──────────────────────────────────
function PeriodHighlight({ mutations, period, customFrom, customTo }: {
  mutations: DashboardMutation[];
  period: PeriodKey;
  customFrom: string;
  customTo: string;
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const summaryKey = useMemo(() => mutations.map((m) => m.id).join(","), [mutations]);

  const withTotal = useMemo(() =>
    mutations
      .filter((m) => m.portfolio_total != null && m.portfolio_total > 0)
      .sort((a, b) => {
        const da = a.occurred_at || a.recorded_at;
        const db = b.occurred_at || b.recorded_at;
        return da < db ? -1 : da > db ? 1 : 0;
      }),
    [mutations]
  );

  const byDay = useMemo(() => {
    const map = new Map<string, { date: string; value: number; actions: string[] }>();
    for (const m of withTotal) {
      const day = m.occurred_at || m.recorded_at.split("T")[0];
      if (!map.has(day)) map.set(day, { date: day, value: 0, actions: [] });
      const entry = map.get(day)!;
      entry.value = m.portfolio_total!;
      if (!entry.actions.includes(m.action)) entry.actions.push(m.action);
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [withTotal]);

  const startVal = byDay[0]?.value ?? 0;
  const endVal = byDay[byDay.length - 1]?.value ?? 0;
  const periodLabel = getPeriodLabel(period, customFrom, customTo);

  useEffect(() => {
    if (withTotal.length === 0) return;
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
          occurred_at: m.occurred_at,
          personal_context: m.personal_context,
        })),
        startVal,
        endVal,
        periodLabel,
      }),
    })
      .then((r) => r.json())
      .then((d) => { clearTimeout(timeout); if (!controller.signal.aborted) { setSummary(d.summary || null); setSummaryLoading(false); } })
      .catch(() => { clearTimeout(timeout); if (!controller.signal.aborted) setSummaryLoading(false); });

    return () => { controller.abort(); clearTimeout(timeout); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryKey]);

  if (withTotal.length === 0) return null;

  const pts = byDay;
  const change = endVal - startVal;
  const changePct = startVal > 0 ? (change / startVal) * 100 : 0;
  const positive = change >= 0;

  const W = 560;
  const H = 72;
  const PAD_X = 0;
  const PAD_Y = 8;
  const allVals = pts.map((p) => p.value);
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const range = Math.max(maxVal - minVal, maxVal * 0.0001);

  const toX = (i: number) =>
    pts.length === 1 ? W / 2 : PAD_X + (i / (pts.length - 1)) * (W - PAD_X * 2);
  const toY = (v: number) =>
    PAD_Y + H - ((v - minVal) / range) * H;

  const svgPts = pts.map((p, i) => ({ x: toX(i), y: toY(p.value), ...p }));
  const polylineStr = svgPts.map((p) => `${p.x},${p.y}`).join(" ");
  const areaStr = `${svgPts[0].x},${H + PAD_Y * 2} ` + polylineStr + ` ${svgPts[svgPts.length - 1].x},${H + PAD_Y * 2}`;

  const lineColor = positive ? "var(--accent)" : "var(--negative)";
  const gradientId = `dg-${positive ? "pos" : "neg"}`;

  const dotColor = (actions: string[]) => {
    if (actions.includes("remove")) return "var(--negative)";
    if (actions.includes("add")) return "var(--positive)";
    return "var(--accent)";
  };

  const adds = mutations.filter((m) => m.action === "add").length;
  const edits = mutations.filter((m) => m.action === "edit").length;
  const removes = mutations.filter((m) => m.action === "remove").length;

  return (
    <div className="bg-surface rounded-2xl border border-border p-5 mb-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div
            className="font-mono text-faint uppercase mb-1"
            style={{ fontSize: 10, letterSpacing: "0.16em" }}
          >
            Portfolio during {periodLabel}
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className="font-serif text-fg"
              style={{ fontSize: 24, fontWeight: 400, letterSpacing: "-0.02em", fontVariationSettings: "'opsz' 144" }}
            >
              <PriceDisplay amount={endVal} compact />
            </span>
            <span
              className="font-mono"
              style={{ fontSize: 13, fontWeight: 500, color: positive ? "var(--positive)" : "var(--negative)" }}
            >
              {positive ? "+" : ""}{fmt(change)}
            </span>
            <span
              className="font-mono"
              style={{ fontSize: 12, color: positive ? "var(--positive)" : "var(--negative)" }}
            >
              ({positive ? "+" : ""}{changePct.toFixed(1)}%)
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-faint mb-0.5" style={{ fontSize: 10 }}>Started at</div>
          <div className="font-mono text-dim" style={{ fontSize: 13, fontWeight: 500 }}>{fmt(startVal)}</div>
        </div>
      </div>

      {/* Chart */}
      <div className="relative -mx-5">
        <svg
          viewBox={`0 0 ${W} ${H + PAD_Y * 2}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height: 88, display: "block" }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.15" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          <line
            x1={0} y1={(H + PAD_Y * 2) / 2}
            x2={W} y2={(H + PAD_Y * 2) / 2}
            stroke="var(--border)" strokeWidth="1"
          />
          <polygon points={areaStr} fill={`url(#${gradientId})`} />
          <polyline
            points={polylineStr}
            fill="none"
            stroke={lineColor}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {pts.length <= 30 && svgPts.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={pts.length <= 10 ? 3 : 2.5}
              fill={dotColor(p.actions)}
              stroke="var(--surface)"
              strokeWidth="1.5"
            />
          ))}
        </svg>
        <div className="flex justify-between px-5 mt-1">
          <span className="font-mono text-faint" style={{ fontSize: 10 }}>{formatDate(pts[0].date)}</span>
          {pts.length > 1 && (
            <span className="font-mono text-faint" style={{ fontSize: 10 }}>{formatDate(pts[pts.length - 1].date)}</span>
          )}
        </div>
      </div>

      {/* Activity summary */}
      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border">
        {adds > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-positive" />
            <span className="font-mono text-dim" style={{ fontSize: 11 }}>{adds} added</span>
          </div>
        )}
        {edits > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-accent" />
            <span className="font-mono text-dim" style={{ fontSize: 11 }}>{edits} updated</span>
          </div>
        )}
        {removes > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-negative" />
            <span className="font-mono text-dim" style={{ fontSize: 11 }}>{removes} removed</span>
          </div>
        )}
        <div className="ml-auto font-mono text-faint" style={{ fontSize: 11 }}>
          {pts.length} data point{pts.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* AI narrative */}
      {(summaryLoading || summary) && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-start gap-2.5">
            <div
              className="flex items-center justify-center shrink-0 mt-0.5"
              style={{
                width: 20, height: 20, borderRadius: 6,
                background: "var(--accent-soft)",
                border: "1px solid rgba(212,165,116,0.18)",
              }}
            >
              <span className="font-mono text-accent" style={{ fontSize: 9, fontWeight: 600 }}>V</span>
            </div>
            {summaryLoading ? (
              <div className="flex-1 space-y-1.5 pt-0.5">
                <div className="h-2.5 rounded-full bg-surface-elev animate-pulse w-[60%]" />
                <div className="h-2.5 rounded-full bg-surface-elev animate-pulse w-[50%]" />
                <div className="h-2.5 rounded-full bg-surface-elev animate-pulse w-[40%]" />
              </div>
            ) : (
              <ul className="flex-1 space-y-1">
                {(summary ?? "").split("\n").filter(l => l.trim()).map((line, i) => (
                  <li key={i} className="text-dim leading-snug" style={{ fontSize: 12 }}>
                    {line.replace(/^•\s*/, "• ")}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
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

  const hasContent = (m: DashboardMutation) =>
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
  }, {} as Record<string, DashboardMutation[]>);

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

  const ACTION_META = [
    { action: "add",    label: "Added",   color: "#6BAA75", bg: "rgba(107,170,117,0.12)", border: "rgba(107,170,117,0.25)" },
    { action: "edit",   label: "Updated", color: "#D4A574", bg: "rgba(212,165,116,0.12)", border: "rgba(212,165,116,0.25)" },
    { action: "remove", label: "Removed", color: "#C97A6E", bg: "rgba(201,122,110,0.12)", border: "rgba(201,122,110,0.25)" },
  ];

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

      {/* Period filter */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {PERIOD_OPTIONS.map(({ key, label }) => {
          const active = period === key;
          return (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className="font-mono transition-all"
              style={{
                fontSize: 11,
                padding: "6px 12px",
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
        {period === "custom" && (
          <div className="flex items-center gap-1.5 ml-1">
            <select
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="font-mono text-dim bg-surface border border-border rounded-lg outline-none cursor-pointer"
              style={{ fontSize: 11, padding: "5px 8px" }}
            >
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span className="font-mono text-faint" style={{ fontSize: 11 }}>to</span>
            <select
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="font-mono text-dim bg-surface border border-border rounded-lg outline-none cursor-pointer"
              style={{ fontSize: 11, padding: "5px 8px" }}
            >
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Action filter cards */}
      <div className="flex gap-2 mb-6">
        {ACTION_META.map(({ action, label, color, bg, border }) => {
          const count = periodMutations.filter((m) => m.action === action).length;
          const active = diaryFilter === action;
          return (
            <button
              key={action}
              onClick={() => setDiaryFilter(active ? "all" : action)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-left"
              style={{
                background: active ? bg : "transparent",
                borderColor: active ? border : "var(--border)",
              }}
            >
              <span
                className="font-mono"
                style={{ fontSize: 12, fontWeight: 600, color: active ? color : "var(--text-faint)" }}
              >
                {count}
              </span>
              <span style={{ fontSize: 12, color: active ? color : "var(--text-faint)" }}>
                {label}
              </span>
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
              const style = ACTION_STYLE[m.action] || ACTION_STYLE.edit;
              const date = m.occurred_at || m.recorded_at;
              const valueChange = m.action === "edit" && m.before_value != null && m.after_value != null
                ? m.after_value - m.before_value : null;
              const hasValueChange = valueChange !== null && valueChange !== 0;

              let valueText: string | null = null;
              if (m.action === "add" && m.after_value != null) {
                valueText = fmt(m.after_value);
              } else if (m.action === "edit" && hasValueChange && m.before_value != null && m.after_value != null) {
                valueText = `${fmt(m.before_value)} → ${fmt(m.after_value)}`;
              } else if (m.action === "remove" && m.before_value != null) {
                valueText = fmt(m.before_value);
              }

              return (
                <div
                  key={m.id}
                  className="py-3.5 border-b border-border last:border-0"
                >
                  {/* Top row: action tag + asset icon + date */}
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="font-mono uppercase"
                        style={{
                          fontSize: 9, fontWeight: 500,
                          padding: "2px 7px", borderRadius: 4,
                          letterSpacing: "0.1em",
                          color: style.color, background: style.bg,
                        }}
                      >
                        {style.label}
                      </span>
                      <AssetIcon type={m.asset_type} symbol={m.symbol} />
                    </div>
                    <span
                      className="font-mono text-faint uppercase"
                      style={{ fontSize: 10, letterSpacing: "0.12em" }}
                    >
                      {formatDate(date)}
                    </span>
                  </div>

                  {/* Asset name — serif */}
                  <div
                    className="font-serif text-fg leading-snug"
                    style={{ fontSize: 17, fontWeight: 400, fontVariationSettings: "'opsz' 144" }}
                  >
                    {m.asset_name}
                  </div>

                  {/* Value */}
                  {valueText && (
                    <div className="font-mono text-dim mt-1" style={{ fontSize: 12 }}>
                      {valueText}
                      {hasValueChange && valueChange !== null && (
                        <span
                          className="ml-2 font-medium"
                          style={{ color: valueChange >= 0 ? "var(--positive)" : "var(--negative)" }}
                        >
                          {valueChange >= 0 ? "+" : ""}{fmt(valueChange)}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Context — italic with left border */}
                  {m.personal_context && (
                    <div
                      className="text-dim italic leading-[1.55] mt-2 border-l-2 border-border-strong pl-2.5"
                      style={{ fontSize: 12 }}
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

"use client";

import { useState, Fragment } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { formatDate, getMonthKey, getMonthLabel } from "@/lib/utils";
import { useDisplayCurrency } from "@/lib/hooks";
import { formatMoney, type DisplayCurrency } from "@/lib/money";
import type { Mutation } from "@/lib/supabase";
import { AssetLogo } from "@/components/AssetLogo";
import { DiaryRowContent } from "@/components/diary/DiaryRowContent";
import { DiaryMarketRow } from "@/components/DiaryMarketRow";
import { PeriodHighlight } from "@/components/diary/PeriodHighlight";
import { useDiaryMarketMoves } from "@/hooks/useDiaryMarketMoves";
import type { DiaryMarketMove } from "@/lib/diary-market-moves";
import {
  TRADEABLE_TYPES, STARTING_POSITION_CTX,
  type DiaryItem, type PeriodKey,
  PERIOD_OPTIONS, SELECT_STYLE,
  unitNoun, hasContent, relativeAge, displayName, actionVerb,
  buildDisplayItems, abbrevMoney, buildGroupAggregate,
  getMonthOptions, isInPeriod,
} from "@/lib/diary-utils";

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

interface DiaryTabProps {
  mutations: Mutation[];
  hasMore?: boolean;
  onLoadMore?: () => void;
}

export function DiaryTab({ mutations, hasMore, onLoadMore }: DiaryTabProps) {
  const displayCurrency = useDisplayCurrency();
  const { moves } = useDiaryMarketMoves();
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [customFrom, setCustomFrom] = useState(thisMonth);
  const [customTo, setCustomTo] = useState(thisMonth);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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
        (m.personal_context ?? "").toLowerCase().includes(trimmedQuery) ||
        (m.market_context ?? "").toLowerCase().includes(trimmedQuery)
      );
    });

  // Deterministic market-move highlights — read-only context rows anchored
  // around mutation dates. Same period filter as mutations; hidden under search.
  const periodMoves = moves.filter((mv) =>
    isInPeriod({ occurred_at: mv.date, recorded_at: mv.date } as Mutation, period, customFrom, customTo)
  );
  const activeMoves = trimmedQuery ? [] : periodMoves;

  const groupedMoves = activeMoves.reduce((acc, mv) => {
    const key = getMonthKey(mv.date);
    if (!acc[key]) acc[key] = [];
    acc[key].push(mv);
    return acc;
  }, {} as Record<string, DiaryMarketMove[]>);

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

  const monthKeys = [...new Set([...Object.keys(grouped), ...Object.keys(groupedMoves)])]
    .sort((a, b) => b.localeCompare(a));

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
      <div style={{ position: "relative", marginBottom: 8 }}>
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
                fontSize: 12,
                padding: "4px 10px",
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
        <PeriodHighlight
          mutations={periodMutations}
          period={period}
          customFrom={customFrom}
          customTo={customTo}
        />
      )}

      {/* On this day — full-bleed accent-soft band */}
      {anniversaryEntry && (
        <button
          onClick={() => jumpToEntry(anniversaryEntry.mutation)}
          className="mx-0 md:-mx-8 mb-[18px]"
          style={{
            display: "block",
            textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer",
            position: "relative", width: "auto",
          }}
        >
          <div
            style={{ position: "relative", background: "var(--accent-soft)" }}
            className="px-4 md:px-8 py-[14px]"
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
        const monthMutations = grouped[monthKey] ?? [];
        const monthItems = buildDisplayItems(monthMutations, !!trimmedQuery);
        const monthMoves = groupedMoves[monthKey] ?? [];

        const itemDate = (item: DiaryItem): string =>
          item.kind === "singleton"
            ? (item.mutation.occurred_at || item.mutation.recorded_at)
            : (item.anchor.occurred_at || item.anchor.recorded_at);

        type RenderEntry =
          | { kind: "item"; date: string; item: DiaryItem }
          | { kind: "move"; date: string; move: DiaryMarketMove };

        const renderEntries: RenderEntry[] = [
          ...monthItems.map((item): RenderEntry => ({ kind: "item", date: itemDate(item), item })),
          ...monthMoves.map((mv): RenderEntry => ({ kind: "move", date: mv.date, move: mv })),
        ].sort((a, b) => {
          if (a.date !== b.date) return b.date.localeCompare(a.date);
          if (a.kind === b.kind) return 0;
          return a.kind === "move" ? 1 : -1; // moves sort after mutations on the same date
        });

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
                {monthMutations.length} {monthMutations.length === 1 ? "entry" : "entries"}
              </div>
            </div>

            {/* Entry rows */}
            <div>
              {renderEntries.map((entry) => {
                if (entry.kind === "move") {
                  return <DiaryMarketRow key={`move-${entry.move.index_symbol}-${entry.move.date}`} move={entry.move} />;
                }

                const item = entry.item;
                if (item.kind === "singleton") {
                  const m = item.mutation;
                  const date = m.occurred_at || m.recorded_at;
                  const valueNode = buildValueNode(m, displayCurrency);
                  const name = displayName(m);
                  const isRemovedAsset = !m.asset_id;
                  const rowStyle = {
                    borderBottom: "0.5px solid var(--border)",
                    ...(highlightedId === m.id ? { animation: "diaryHighlight 1.5s ease-out forwards" } : {}),
                  };
                  const rowContent = (
                    <DiaryRowContent
                      logo={<div style={{ opacity: isRemovedAsset ? 0.7 : 1, flexShrink: 0 }}><AssetLogo type={m.asset_type} symbol={m.symbol} name={name} size={28} /></div>}
                      name={name}
                      nameColor={isRemovedAsset ? "var(--text-dim)" : "var(--text)"}
                      valueNode={valueNode}
                      date={date}
                      personalContext={m.personal_context ?? null}
                      marketContext={m.market_context ?? null}
                    />
                  );
                  // Removed assets (asset_id ON DELETE SET NULL) have no detail
                  // screen to open — render the row non-interactive. Otherwise the
                  // whole row links to the asset detail, the same route the holdings
                  // rows use (tradeable → tradeable detail, real_estate → property).
                  return isRemovedAsset ? (
                    <div
                      key={m.id}
                      id={`diary-entry-${m.id}`}
                      className="last:border-0"
                      style={rowStyle}
                    >
                      {rowContent}
                    </div>
                  ) : (
                    <Link
                      key={m.id}
                      id={`diary-entry-${m.id}`}
                      href={`/asset/${m.asset_id}`}
                      className="block last:border-0"
                      style={rowStyle}
                    >
                      {rowContent}
                    </Link>
                  );
                }

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
                        cursor: "pointer",
                        ...(highlightedId === anchor.id ? { animation: "diaryHighlight 1.5s ease-out forwards" } : {}),
                      }}
                    >
                      <DiaryRowContent
                        logo={<div style={{ opacity: isRemovedGroup ? 0.7 : 1, flexShrink: 0 }}><AssetLogo type={anchor.asset_type} symbol={anchor.symbol} name={displayName(anchor)} size={28} /></div>}
                        name={groupName}
                        nameColor={isRemovedGroup ? "var(--text-dim)" : "var(--text)"}
                        valueNode={groupAggNode}
                        date={anchorDate}
                        personalContext={anchorContext}
                        marketContext={null}
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
                          className="last:border-0"
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

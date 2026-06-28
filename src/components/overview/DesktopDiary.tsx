"use client";

import { useState, useEffect, Fragment } from "react";
import Link from "next/link";
import { getMonthKey, getMonthLabel, formatDate } from "@/lib/utils";
import { useDisplayCurrency } from "@/lib/hooks";
import { formatMoney, toUsdClient, type DisplayCurrency } from "@/lib/money";
import type { Mutation } from "@/lib/supabase";
import { AssetLogo } from "@/components/AssetLogo";
import { DiaryMarketRow } from "@/components/DiaryMarketRow";
import { DesktopMarketEntry } from "@/components/overview/DesktopMarketEntry";
import { PeriodHighlight } from "@/components/diary/PeriodHighlight";
import { useDiaryMarketMoves } from "@/hooks/useDiaryMarketMoves";
import type { DiaryMarketMove } from "@/lib/diary-market-moves";
import {
  TRADEABLE_TYPES, STARTING_POSITION_CTX, type DiaryItem, type PeriodKey,
  PERIOD_OPTIONS, SELECT_STYLE, unitNoun, hasContent, relativeAge, displayName,
  actionVerb, buildDisplayItems, abbrevMoney, getMonthOptions, isInPeriod,
} from "@/lib/diary-utils";

type Val = { text: string; cls: string } | null;

function diaryValue(m: Mutation, dc: DisplayCurrency): Val {
  const unitEligible = m.asset_type != null && TRADEABLE_TYPES.has(m.asset_type) && (m.before_units != null || m.after_units != null);
  const noun = unitNoun(m.asset_type);
  if (unitEligible) {
    if (m.action === "add" && m.after_units != null) return { text: `+${m.after_units.toLocaleString()} ${noun}`, cls: "up" };
    if (m.action === "edit") { const d = (m.after_units ?? 0) - (m.before_units ?? 0); if (d !== 0) return { text: `${d >= 0 ? "+" : "−"}${Math.abs(d).toLocaleString()} ${noun}`, cls: d >= 0 ? "up" : "dn" }; }
    if (m.action === "remove" && m.before_units != null) return { text: `${m.before_units.toLocaleString()} ${noun}`, cls: "strike" };
  }
  const cur = m.currency || "USD";
  if (m.action === "add" && m.after_value != null) return { text: `+${formatMoney(m.after_value, cur, dc)}`, cls: "up" };
  if (m.action === "edit") {
    const d = m.before_value != null && m.after_value != null ? m.after_value - m.before_value : null;
    if (d !== null && d !== 0) return { text: `${d >= 0 ? "+" : "−"}${formatMoney(Math.abs(d), cur, dc)}`, cls: d >= 0 ? "up" : "dn" };
    if (m.after_value != null) return { text: formatMoney(m.after_value, cur, dc), cls: "flat" };
  }
  if (m.action === "remove" && m.before_value != null) return { text: formatMoney(m.before_value, cur, dc), cls: "strike" };
  return null;
}

function groupValue(members: Mutation[], dc: DisplayCurrency): Val {
  const action = members[0].action;
  if (action === "remove") { const t = members.reduce((s, m) => s + toUsdClient(m.before_value ?? 0, m.currency || "USD"), 0); return t ? { text: `−${abbrevMoney(t, dc)}`, cls: "dn" } : null; }
  if (action === "add") { const t = members.reduce((s, m) => s + toUsdClient(m.after_value ?? 0, m.currency || "USD"), 0); return t ? { text: `+${abbrevMoney(t, dc)}`, cls: "up" } : null; }
  const net = members.reduce((s, m) => (m.before_value == null || m.after_value == null ? s : s + toUsdClient(m.after_value - m.before_value, m.currency || "USD")), 0);
  return net ? { text: `${net >= 0 ? "+" : "−"}${abbrevMoney(Math.abs(net), dc)}`, cls: net >= 0 ? "up" : "dn" } : null;
}

function ValueRight({ v, date }: { v: Val; date: string }) {
  return (
    <div className="drow-r">
      {v && <span className={`drow-v ${v.cls}`}>{v.text}</span>}
      <span className="drow-date">{formatDate(date)}</span>
    </div>
  );
}

interface Props {
  mutations: Mutation[];
  hasMore?: boolean;
  onLoadMore?: () => void;
}

// Desktop Journal — the approved Twilight design over the live decision journal.
// Reuses all the diary logic (diary-utils, market moves, the AI period summary)
// and re-presents it as a Twilight ledger. Mobile keeps DiaryTab unchanged.
export function DesktopDiary({ mutations, hasMore, onLoadMore }: Props) {
  const displayCurrency = useDisplayCurrency();
  const { moves } = useDiaryMarketMoves();
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [customFrom, setCustomFrom] = useState(thisMonth);
  const [customTo, setCustomTo] = useState(thisMonth);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  // Deep link from an asset's activity row: /diary?focus=<mutationId> scrolls to
  // that entry and flashes it. Read client-side (no Suspense needed) on mount.
  const [focusId, setFocusId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("focus");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (f) { setFocusId(f); setPeriod("all"); setSearchQuery(""); }
  }, []);
  useEffect(() => {
    if (!focusId) return;
    // The target row may not exist yet on a cold deep-link (mutations load async),
    // so poll for it (up to ~4s) instead of a single fixed timer, then scroll +
    // flash once — and time the flash from when the row actually appears.
    let done = false;
    let tries = 0;
    let flashTimer: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => {
      if (done) return;
      const el = document.getElementById(`diary-entry-${focusId}`);
      if (el) {
        done = true;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedId(focusId);
        flashTimer = setTimeout(() => setHighlightedId(null), 1800);
        return;
      }
      if (tries++ < 40) flashTimer = setTimeout(attempt, 100);
    };
    flashTimer = setTimeout(attempt, 60);
    return () => { done = true; if (flashTimer) clearTimeout(flashTimer); };
  }, [focusId]);

  const anniversary = (() => {
    const month = now.getMonth(), day = now.getDate();
    const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    const cands = mutations.filter(hasContent).filter((m) => {
      if (!m.occurred_at) return false;
      const [y, mo, d] = m.occurred_at.split("-").map(Number);
      return mo - 1 === month && d === day && new Date(y, mo - 1, d).getTime() <= cutoff;
    });
    if (!cands.length) return null;
    const m = [...cands].sort((a, b) => a.occurred_at!.localeCompare(b.occurred_at!))[0];
    const [y, mo, d] = m.occurred_at!.split("-").map(Number);
    return { mutation: m, date: new Date(y, mo - 1, d) };
  })();

  const periodMutations = mutations.filter(hasContent).filter((m) => isInPeriod(m, period, customFrom, customTo));
  const q = searchQuery.trim().toLowerCase();
  const filtered = periodMutations.filter((m) => !q || displayName(m).toLowerCase().includes(q)
    || (m.symbol ?? "").toLowerCase().includes(q) || (m.personal_context ?? "").toLowerCase().includes(q)
    || (m.market_context ?? "").toLowerCase().includes(q));

  const periodMoves = q ? [] : moves.filter((mv) => isInPeriod({ occurred_at: mv.date, recorded_at: mv.date } as Mutation, period, customFrom, customTo));
  const groupedMoves = periodMoves.reduce((acc, mv) => { (acc[getMonthKey(mv.date)] ??= []).push(mv); return acc; }, {} as Record<string, DiaryMarketMove[]>);

  const grouped = filtered.reduce((acc, m) => { (acc[getMonthKey(m.occurred_at || m.recorded_at)] ??= []).push(m); return acc; }, {} as Record<string, Mutation[]>);
  const monthKeys = [...new Set([...Object.keys(grouped), ...Object.keys(groupedMoves)])].sort((a, b) => b.localeCompare(a));
  for (const k of monthKeys) grouped[k]?.sort((a, b) => {
    const da = a.occurred_at ?? a.recorded_at, db = b.occurred_at ?? b.recorded_at;
    return da !== db ? db.localeCompare(da) : b.recorded_at.localeCompare(a.recorded_at);
  });
  const monthOptions = getMonthOptions(mutations);

  const toggle = (id: string) => setExpandedGroups((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <>
      {/* Search */}
      <div className="dsearch">
        <svg className="si" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5L21 21" /></svg>
        <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search asml, april, removed…" aria-label="Search the journal" />
        {searchQuery && <button className="sx" onClick={() => setSearchQuery("")} aria-label="Clear search">×</button>}
      </div>

      {/* Period chips */}
      <div className="dchips">
        {PERIOD_OPTIONS.map(({ key, label }) => (
          <button key={key} className={`dchip${period === key ? " on" : ""}`} onClick={() => setPeriod(key)} aria-pressed={period === key}>{label}</button>
        ))}
      </div>
      {period === "custom" && (
        <div className="flex items-center gap-1.5" style={{ marginBottom: 20 }}>
          <select value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={SELECT_STYLE}>
            {monthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>to</span>
          <select value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={SELECT_STYLE}>
            {monthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}

      {period !== "all" && (
        <div style={{ marginBottom: 22 }}>
          <PeriodHighlight mutations={periodMutations} period={period} customFrom={customFrom} customTo={customTo} />
        </div>
      )}

      {anniversary && (
        <div className="danniv">
          <div className="danniv-l">Worth knowing</div>
          <div className="danniv-t">
            {relativeAge(anniversary.date, now)} you{" "}
            {anniversary.mutation.action === "add" ? (anniversary.mutation.personal_context === STARTING_POSITION_CTX ? "started tracking" : "added") : anniversary.mutation.action === "remove" ? "removed" : "edited"}{" "}
            <i>{displayName(anniversary.mutation)}</i>
            {anniversary.mutation.personal_context && anniversary.mutation.personal_context !== STARTING_POSITION_CTX && <i> — {anniversary.mutation.personal_context}</i>}
          </div>
        </div>
      )}

      {monthKeys.length === 0 && (
        <div className="dledger"><div className="dempty">{q ? `No entries match “${searchQuery.trim()}”.` : "No entries for this period."}</div></div>
      )}

      {monthKeys.map((monthKey) => {
        const monthMutations = grouped[monthKey] ?? [];
        const items = buildDisplayItems(monthMutations, !!q);
        const monthMoves = groupedMoves[monthKey] ?? [];
        const itemDate = (it: DiaryItem) => it.kind === "singleton" ? (it.mutation.occurred_at || it.mutation.recorded_at) : (it.anchor.occurred_at || it.anchor.recorded_at);
        type Entry = { kind: "item"; date: string; item: DiaryItem } | { kind: "move"; date: string; move: DiaryMarketMove };
        const entries: Entry[] = [
          ...items.map((item): Entry => ({ kind: "item", date: itemDate(item), item })),
          ...monthMoves.map((mv): Entry => ({ kind: "move", date: mv.date, move: mv })),
        ].sort((a, b) => a.date !== b.date ? b.date.localeCompare(a.date) : (a.kind === b.kind ? 0 : a.kind === "move" ? 1 : -1));

        return (
          <div className="dledger" key={monthKey}>
            <div className="dmonth">
              <h3>{getMonthLabel(monthKey)}</h3>
              <span className="cnt">{monthMutations.length} {monthMutations.length === 1 ? "entry" : "entries"}</span>
            </div>
            {entries.map((entry) => {
              if (entry.kind === "move") {
                const key = `mv-${entry.move.index_symbol}-${entry.move.date}`;
                return entry.move.expanded && entry.move.impact
                  ? <DesktopMarketEntry key={key} move={entry.move} />
                  : <DiaryMarketRow key={key} move={entry.move} />;
              }
              const item = entry.item;
              if (item.kind === "singleton") {
                const m = item.mutation;
                const name = displayName(m);
                const gone = !m.asset_id;
                const v = diaryValue(m, displayCurrency);
                // Auto entry: a market-driven revaluation Volnar logged itself
                // (market context, no personal note) — given a distinct look.
                const isAuto = !!m.market_context && !m.personal_context;
                const inner = (
                  <>
                    <div style={{ opacity: gone ? 0.7 : 1 }}><AssetLogo type={m.asset_type} symbol={m.symbol} name={name} size={30} /></div>
                    <div className="drow-m">
                      <div className={`drow-n${gone ? " gone" : ""}`}>{name}{isAuto && <span className="drow-auto">Auto</span>}</div>
                      {m.personal_context && <div className="drow-why">{m.personal_context}</div>}
                      {m.market_context && <div className="drow-why"><span className="drow-ctx">Markets</span>{m.market_context}</div>}
                    </div>
                    <ValueRight v={v} date={m.occurred_at || m.recorded_at} />
                  </>
                );
                const cls = `drow${isAuto ? " drow-market" : ""}${highlightedId === m.id ? " dfocus" : ""}`;
                return gone
                  ? <div className={cls} key={m.id} id={`diary-entry-${m.id}`}>{inner}</div>
                  : <Link className={cls} key={m.id} id={`diary-entry-${m.id}`} href={`/asset?id=${m.asset_id}`}>{inner}</Link>;
              }
              const { id: gid, anchor, members, groupName } = item;
              // Auto-open the group that holds the deep-linked entry so it can scroll to it.
              const open = expandedGroups.has(gid) || (focusId != null && members.some((mm) => mm.id === focusId));
              const gone = !anchor.asset_id;
              const ctx = members.find((mm) => !!mm.personal_context)?.personal_context ?? null;
              const gv = groupValue(members, displayCurrency);
              return (
                <Fragment key={gid}>
                  <button className="drow" type="button" onClick={() => toggle(gid)} aria-expanded={open}>
                    <div style={{ opacity: gone ? 0.7 : 1 }}><AssetLogo type={anchor.asset_type} symbol={anchor.symbol} name={displayName(anchor)} size={30} /></div>
                    <div className="drow-m">
                      <div className={`drow-n${gone ? " gone" : ""}`}>{groupName}</div>
                      <div className="drow-sub">· {members.length} {actionVerb(anchor.action)}</div>
                      {ctx && <div className="drow-why">{ctx}</div>}
                      <div className="drow-more">{open ? "↑ Hide" : `↓ Show all ${members.length} entries`}</div>
                    </div>
                    <ValueRight v={gv} date={anchor.occurred_at || anchor.recorded_at} />
                  </button>
                  {open && members.map((m) => {
                    const v = diaryValue(m, displayCurrency);
                    return (
                      <div className={`dchild${highlightedId === m.id ? " dfocus" : ""}`} key={m.id} id={`diary-entry-${m.id}`}>
                        <span />
                        <span>{v && <span className={`drow-v ${v.cls}`}>{v.text}</span>}</span>
                        <span className="drow-date">{formatDate(m.occurred_at || m.recorded_at)}</span>
                      </div>
                    );
                  })}
                </Fragment>
              );
            })}
          </div>
        );
      })}

      {hasMore && onLoadMore && (
        <div className="dmore"><button onClick={onLoadMore}>Load more</button></div>
      )}
    </>
  );
}

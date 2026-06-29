"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatMoney, type DisplayCurrency } from "@/lib/money";
import { displayName, unitNoun, STARTING_POSITION_CTX } from "@/lib/diary-utils";
import { apiFetch } from "@/lib/api";
import type { Mutation } from "@/lib/supabase";
import type { VerdictData } from "@/lib/scenario/decision-verdict";

// The phone equivalent of the desktop Overview's selected-entry panel: step
// through your decisions below the chart and see each one's reasoning plus the
// "Looking back" Decision Verdict. Self-contained (the desktop is left untouched)
// and styled in the mobile Twilight idiom (tokens + inline styles, theme-aware).

// ── pure helpers (mirrors the desktop OverviewContent so behaviour matches) ──
export function mDate(m: Mutation): string {
  return m.occurred_at || m.recorded_at;
}
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Real decisions only, newest first — buys (add), sells (remove) and trims (a
// reduce edit). Routine top-ups (an edit that only adds units) are dropped so the
// chart dots and the stepper carry meaningful decisions, not contribution noise.
export function notableDecisions(mutations: Mutation[]): Mutation[] {
  return mutations
    .filter((m) => {
      if (m.action === "add" || m.action === "remove") return true;
      return m.action === "edit" && typeof m.before_units === "number" && typeof m.after_units === "number" && m.before_units > m.after_units;
    })
    .sort((a, b) => mDate(b).localeCompare(mDate(a)));
}

export function decisionTitle(m: Mutation): string {
  const name = displayName(m);
  if (!name) return m.action === "add" ? "Added a holding" : m.action === "remove" ? "Removed a holding" : "Adjusted the portfolio";
  if (m.action === "add") return `Added ${name}`;
  if (m.action === "remove") return `Removed ${name}`;
  return `Adjusted ${name}`;
}
function hasOwnNote(m: Mutation): boolean {
  return !!m.personal_context && m.personal_context !== STARTING_POSITION_CTX;
}
function impactRaw(m: Mutation): number {
  if (m.action === "add") return m.after_value ?? 0;
  if (m.action === "remove") return -(m.before_value ?? 0);
  return (m.after_value ?? 0) - (m.before_value ?? 0);
}
const fmtUnits = (n: number) =>
  new Intl.NumberFormat("nl-NL", { maximumFractionDigits: n % 1 === 0 ? 0 : 4 }).format(n);

function decisionPoints(m: Mutation, displayCurrency: DisplayCurrency): string[] {
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

function verdictEligible(m: Mutation): boolean {
  if (!m.symbol) return false;
  const type = m.asset_type ?? "";
  const occurred = mDate(m).slice(0, 10);
  if (!occurred || (Date.now() - Date.parse(occurred)) / 86_400_000 < 21) return false;
  const before = typeof m.before_units === "number" ? m.before_units : null;
  const after = m.action === "remove" ? 0 : typeof m.after_units === "number" ? m.after_units : null;
  const isReduce = m.action === "remove" || (m.action === "edit" && before != null && after != null && before > after);
  if (isReduce) return ["stocks", "etf", "crypto"].includes(type) && before != null && after != null && before - after > 0;
  if (m.action === "add") return ["stocks", "crypto"].includes(type) && (m.after_units ?? 0) > 0;
  return false;
}

// ── verdict stamp (mobile-styled; mirrors the desktop VerdictStamp copy) ──
function VerdictStamp({ verdict, unitLabel }: { verdict: VerdictData; unitLabel: string }) {
  const [open, setOpen] = useState(false);
  const cur = verdict.currency as DisplayCurrency;
  const fmt = (v: number) => formatMoney(v, cur, cur);
  const money = fmt(verdict.figure);
  const d = verdict.detail;
  const bench = verdict.benchmarkLabel ?? "the index";

  let line: string;
  let calc: string;
  let notes: string[];
  if (verdict.mode === "buy") {
    line =
      verdict.kind === "beat" ? `Buying here beat ${bench} by ${money} — your pick has outpaced the index since.`
      : verdict.kind === "trailed" ? `Buying here trailed ${bench} by ${money} — the same money in the index would be worth more.`
      : `This roughly matched ${bench} — about what the index would have done with the same money.`;
    const tail = verdict.kind === "matched" ? " — roughly level." : ` — ${verdict.kind === "beat" ? "ahead" : "behind"} by ${money}.`;
    calc = `Those ${fmtUnits(d.units)} ${unitLabel} were worth about ${fmt(d.valueThen)} at the close on ${shortDate(d.date)}, and today they're ${fmt(d.valueNow)}. The same amount in ${bench} would be about ${fmt(d.benchmarkNow ?? 0)}${tail}`;
    notes = [
      `Compares your position today with the same capital put into ${bench} on the same day.`,
      "Both valued at closing prices; dividends aren't reinvested on either side.",
    ];
  } else {
    line =
      verdict.kind === "spared" ? `Selling here spared you ${money} — the stake you let go is worth less now.`
      : verdict.kind === "missed" ? `Holding on would have gained ${money} — the stake kept climbing after you sold.`
      : "This came out roughly even — the stake you sold is worth about what it was.";
    const rose = d.valueNow >= d.valueThen;
    calc = `The ${fmtUnits(d.units)} ${unitLabel} you sold were worth ${fmt(d.valueThen)} on ${shortDate(d.date)}, and would be worth ${fmt(d.valueNow)} today — a ${rose ? "rise" : "fall"} of ${money}.`;
    notes = [
      "Valued at each date's closing price, with historical exchange rates applied per date.",
      "What the freed-up cash did afterwards isn't counted — this weighs only the position you let go.",
    ];
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border-strong)" }}>
      <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 7 }}>
        Looking back · {verdict.lookbackLabel}
      </div>
      <p style={{ fontSize: "var(--fs-body)", color: "var(--text)", lineHeight: "var(--lh-body)", margin: 0 }}>{line}</p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ marginTop: 9, background: "none", border: "none", padding: 0, fontFamily: "var(--mono)", fontSize: "var(--fs-micro)", letterSpacing: "0.03em", color: "var(--text-dim)", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
      >
        {open ? "Hide how this is figured" : "How this is figured"}
      </button>
      {open && (
        <div style={{ marginTop: 11, display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ margin: 0, fontSize: "var(--fs-body)", color: "var(--text-dim)", lineHeight: "var(--lh-body)" }}>{calc}</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 5 }}>
            {notes.map((n, i) => (
              <li key={i} style={{ position: "relative", paddingLeft: 15, fontSize: "var(--fs-caption)", color: "var(--text-faint)", lineHeight: "var(--lh-body)" }}>
                <span style={{ position: "absolute", left: 2, top: 7, width: 4, height: 4, borderRadius: "var(--radius-pill)", background: "var(--text-faint)" }} aria-hidden="true" />
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function MobileDecisionJournal({
  decisions, selectedId, displayCurrency,
}: {
  decisions: Mutation[];
  selectedId: string | null;
  displayCurrency: DisplayCurrency;
}) {
  // Controlled by the shared selection (a tapped chart dot). When nothing is
  // selected, default to the newest decision so the panel is never empty.
  const index = useMemo(() => {
    const i = decisions.findIndex((d) => d.id === selectedId);
    return i >= 0 ? i : 0;
  }, [decisions, selectedId]);
  const m = decisions[index];

  // Verdict — fetched lazily for the selected eligible decision, cached per
  // (mutation, currency); null marks "asked, nothing to show".
  const [verdicts, setVerdicts] = useState<Record<string, VerdictData | null>>({});
  const asked = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!m || !verdictEligible(m)) return;
    const key = `${m.id}|${displayCurrency}`;
    if (asked.current.has(key)) return;
    asked.current.add(key);
    let cancelled = false;
    apiFetch("/api/decisions/verdict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mutation_id: m.id, display_currency: displayCurrency }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => { if (!cancelled) setVerdicts((v) => ({ ...v, [key]: body?.eligible ? (body as VerdictData) : null })); })
      .catch(() => { if (!cancelled) asked.current.delete(key); });
    return () => { cancelled = true; };
  }, [m, displayCurrency]);

  if (decisions.length === 0 || !m) return null;

  const own = hasOwnNote(m);
  const points = decisionPoints(m, displayCurrency);
  const verdict = verdicts[`${m.id}|${displayCurrency}`];

  return (
    <section style={{ marginTop: 8, marginBottom: 22 }}>
      {/* Entry detail. Selection is driven by the chart dots (tap a marker to show
          that decision) — no in-panel stepper or divider, so the panel reads as
          one continuous block aligned with the holdings below. The date sits as a
          quiet eyebrow above the title so the entry is still anchored in time. */}
      <div className="eyebrow" style={{ marginBottom: 7 }}>
        {shortDate(mDate(m))}
      </div>
      <h3 className="font-serif" style={{ fontSize: "var(--fs-subhead)", fontWeight: 500, letterSpacing: "var(--tracking-subhead)", color: "var(--hero)", lineHeight: "var(--lh-snug)", margin: "0 0 10px" }}>
        {decisionTitle(m)}
      </h3>
      {m.market_context && (
        <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: "var(--fs-body)", color: "var(--text)", lineHeight: "var(--lh-body)", margin: "0 0 9px" }}>{m.market_context}</p>
      )}
      <p style={{ fontSize: "var(--fs-body)", color: "var(--text-dim)", lineHeight: "var(--lh-body)", margin: 0 }}>
        {own ? m.personal_context
          : m.personal_context === STARTING_POSITION_CTX ? "Started tracking from here."
          : "Recorded automatically — no note attached."}
      </p>
      {points.length > 0 && (
        <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {points.map((p, i) => (
            <li key={i} style={{ position: "relative", paddingLeft: 17, fontSize: "var(--fs-body)", color: "var(--text-dim)", lineHeight: "var(--lh-body)", fontVariantNumeric: "tabular-nums" }}>
              <span style={{ position: "absolute", left: 2, top: 9, width: 5, height: 5, borderRadius: "var(--radius-pill)", background: "var(--text-faint)" }} aria-hidden="true" />
              {p}
            </li>
          ))}
        </ul>
      )}
      {verdict && <VerdictStamp verdict={verdict} unitLabel={m.asset_type ? unitNoun(m.asset_type) : "units"} />}
    </section>
  );
}

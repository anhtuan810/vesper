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
const fmtUnits = (n: number) =>
  new Intl.NumberFormat("nl-NL", { maximumFractionDigits: n % 1 === 0 ? 0 : 4 }).format(n);

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

// ── look-back (the "now" movement; mirrors the desktop VerdictStamp copy) ──
// A perforation marks the passage of time, then an italic-serif hinge line that
// is itself the toggle. Collapsed by default so the Holdings section below stays
// high on screen; tapping the hinge unfolds the verdict, figuring and caveat.
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

  // Set the money figure in gold within the headline sentence.
  const headline = line.split(money);

  return (
    <div>
      {/* The passage of time — a finely-dotted perforation across the entry. */}
      <div className="perforation" style={{ margin: "var(--space-4) 0" }} role="separator" aria-label="time passes" />
      {/* The hinge is the control: an italic-serif line with an em-rule lead-in
          and a chevron that rotates when the look-back is open. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="focus-ring"
        style={{
          display: "flex", alignItems: "center", gap: 9, width: "100%",
          background: "none", border: "none", padding: 0, cursor: "pointer",
          fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400,
          fontSize: "var(--fs-body)", color: "var(--text-dim)", textAlign: "left",
          lineHeight: "var(--lh-snug)",
        }}
      >
        <span aria-hidden style={{ display: "inline-block", width: 18, height: 1, background: "var(--text-faint)", opacity: 0.7, flex: "none" }} />
        <span style={{ flex: 1 }}>Looking back, {verdict.lookbackLabel}</span>
        <svg width="13" height="13" viewBox="0 0 12 12" aria-hidden style={{ flex: "none", transition: "transform 0.25s ease", transform: open ? "rotate(180deg)" : "none", opacity: 0.65 }}>
          <path d="M2.5 4.5L6 8L9.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {/* The look-back proper — the verdict, the figuring (flat, no nested
          layers) and one fine-print caveat line, each rising a beat apart. */}
      {open && (
        <div style={{ marginTop: "var(--space-4)" }}>
          <p className="lookback-rise" style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-subhead)", color: "var(--text)", lineHeight: "var(--lh-read)", margin: 0, animationDelay: "0s" }}>
            {headline.map((part, i) => (
              <span key={i}>
                {part}
                {i < headline.length - 1 && (
                  <span className="tnum" style={{ fontWeight: 600, color: "var(--accent-text)" }}>{money}</span>
                )}
              </span>
            ))}
          </p>
          <p className="lookback-rise" style={{ fontSize: "var(--fs-meta)", color: "var(--text-dim)", lineHeight: "var(--lh-read)", margin: "var(--space-3) 0 0", animationDelay: "0.05s" }}>{calc}</p>
          <p className="lookback-rise" style={{ fontSize: "var(--fs-micro)", color: "var(--text-faint)", lineHeight: "var(--lh-read)", margin: "var(--space-2) 0 0", animationDelay: "0.1s" }}>{notes.join(" ")}</p>
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
  const verdict = verdicts[`${m.id}|${displayCurrency}`];

  return (
    // Margins are 0 — the entry now lives inside the journal card (PortfolioTab),
    // whose padding owns the spacing.
    <section style={{ margin: 0 }}>
      {/* Entry detail — the "then" movement of the letter. Selection is driven by
          the chart dots (tap a marker to show that decision), so there is no
          in-panel stepper or divider. The date is a quiet mono dateline, like a
          line written at the top of a page; the reflection runs as upright serif
          so it reads as a written passage rather than a caption. */}
      <div style={{ fontFamily: "var(--font-numeric)", fontSize: "var(--fs-caption)", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: "var(--space-3)" }}>
        {shortDate(mDate(m))}
      </div>
      <h3 className="font-display" style={{ fontSize: "var(--fs-title)", fontWeight: 500, letterSpacing: "var(--tracking-title)", color: "var(--hero)", lineHeight: "var(--lh-snug)", margin: "0 0 var(--space-2)" }}>
        {decisionTitle(m)}
      </h3>
      <p style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-subhead)", color: "var(--text)", lineHeight: "var(--lh-read)", margin: 0 }}>
        {own ? m.personal_context
          : m.personal_context === STARTING_POSITION_CTX ? "Started tracking from here."
          : "Recorded automatically — no note attached."}
      </p>
      {/* Keyed by the decision so the look-back returns to collapsed when a
          different chart dot is tapped. */}
      {verdict && <VerdictStamp key={m.id} verdict={verdict} unitLabel={m.asset_type ? unitNoun(m.asset_type) : "units"} />}
    </section>
  );
}

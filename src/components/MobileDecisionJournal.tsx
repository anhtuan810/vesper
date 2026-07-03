"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { track } from "@vercel/analytics";
import { AssetMentionLink, linkifyAssetMention } from "@/components/AssetMention";
import { formatMoney, type DisplayCurrency } from "@/lib/money";
import { displayName, unitNoun, STARTING_POSITION_CTX } from "@/lib/diary-utils";
import { apiFetch } from "@/lib/api";
import { isNative } from "@/lib/platform";
import { useSubscription } from "@/components/SubscriptionProvider";
import type { Mutation } from "@/lib/supabase";
import type { VerdictData } from "@/lib/scenario/decision-verdict";

// One quiet Light tap as the verdict sentence settles (Seal Tears). Mirrors
// useChartHaptic's platform handling; silent under reduced motion and on
// devices without haptics; never throws.
function fireVerdictHaptic() {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (isNative()) {
    import("@capacitor/haptics")
      .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }))
      .catch(() => {});
  } else if (typeof navigator?.vibrate === "function") {
    navigator.vibrate(6);
  }
}

// The phone equivalent of the desktop Overview's selected-entry panel: the
// latest (or chart-selected) decision, shown as a *folding* journal entry. By
// default it is a compact two-line teaser — book mark, title, date, a one-line
// note preview and a look-back chip — so Holdings stays high on screen. Tapping
// the header unfolds the full reflection and the "Looking back" Decision Verdict.
// Self-contained (the desktop is left untouched) and styled in the mobile
// Twilight idiom (tokens + inline styles, theme-aware).

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

// The title as rendered in the entry header: the holding's name is an inline
// hyperlink to its detail page (news-site convention). Exited positions have
// no page, so the title stays plain text — same rule the Journal rows use.
function decisionTitleNode(m: Mutation): ReactNode {
  const name = displayName(m);
  if (!name || !m.asset_id) return decisionTitle(m);
  const verb = m.action === "add" ? "Added" : m.action === "remove" ? "Removed" : "Adjusted";
  return (
    <>
      {verb} <AssetMentionLink assetId={m.asset_id} style={{ fontWeight: "inherit" }}>{name}</AssetMentionLink>
    </>
  );
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

// The note shown for a decision — the writer's own words, or a quiet fallback.
function noteFor(m: Mutation): string {
  if (hasOwnNote(m)) return m.personal_context as string;
  if (m.personal_context === STARTING_POSITION_CTX) return "Started tracking from here.";
  return "Recorded automatically — no note attached.";
}

// ── look-back copy (single source; mirrors the desktop VerdictStamp) ────────
// Builds the verdict headline and the figuring line. Used by the unfolded
// VerdictBody; the folded chip needs only kind + figure.
function buildVerdictCopy(verdict: VerdictData, unitLabel: string): { line: string; money: string; calc: string } {
  const cur = verdict.currency as DisplayCurrency;
  const fmt = (v: number) => formatMoney(v, cur, cur);
  const money = fmt(verdict.figure);
  const d = verdict.detail;
  const bench = verdict.benchmarkLabel ?? "the index";

  let line: string;
  let calc: string;
  if (verdict.mode === "buy") {
    line =
      verdict.kind === "beat" ? `Buying here beat ${bench} by ${money} — your pick has outpaced the index since.`
      : verdict.kind === "trailed" ? `Buying here trailed ${bench} by ${money} — the same money in the index would be worth more.`
      : `This roughly matched ${bench} — about what the index would have done with the same money.`;
    const tail = verdict.kind === "matched" ? " — roughly level." : ` — ${verdict.kind === "beat" ? "ahead" : "behind"} by ${money}.`;
    calc = `Those ${fmtUnits(d.units)} ${unitLabel} were worth about ${fmt(d.valueThen)} at the close on ${shortDate(d.date)}, and today they're ${fmt(d.valueNow)}. The same amount in ${bench} would be about ${fmt(d.benchmarkNow ?? 0)}${tail}`;
  } else {
    line =
      verdict.kind === "spared" ? `Selling here spared you ${money} — the stake you let go is worth less now.`
      : verdict.kind === "missed" ? `Holding on would have gained ${money} — the stake kept climbing after you sold.`
      : "This came out roughly even — the stake you sold is worth about what it was.";
    const rose = d.valueNow >= d.valueThen;
    calc = `The ${fmtUnits(d.units)} ${unitLabel} you sold were worth ${fmt(d.valueThen)} on ${shortDate(d.date)}, and would be worth ${fmt(d.valueNow)} today — a ${rose ? "rise" : "fall"} of ${money}.`;
  }
  return { line, money, calc };
}

// The unfolded look-back — a perforation marking the passage of time, then the
// verdict sentence (figure in gold) and the figuring behind it.
//
// The Seal Tears: the FIRST verdict opened in a session performs its reveal —
// the perforation draws itself left→right (~0.5s), then the "Looking back…"
// sentence rises 4px with the gold figure simply present (no count-up), and a
// single Light haptic fires as the sentence settles (onAnimationEnd, never a
// timer). Every later open in the session is instant; reduced-motion users
// get the static layout (the animation classes are inert for them, and the
// haptic guards itself).
function VerdictBody({ verdict, unitLabel }: { verdict: VerdictData; unitLabel: string }) {
  const { line, money, calc } = buildVerdictCopy(verdict, unitLabel);
  const headline = line.split(money);
  const [tear] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      if (sessionStorage.getItem("volnar:verdict-torn")) return false;
      sessionStorage.setItem("volnar:verdict-torn", "1");
      return true;
    } catch {
      return false;
    }
  });
  return (
    <div>
      <div
        className={tear ? "perforation perf-draw" : "perforation"}
        style={{ margin: "var(--space-4) 0" }}
        role="separator"
        aria-label="time passes"
      />
      <div
        className={tear ? "lookback-rise" : undefined}
        style={tear ? { animationDelay: "0.45s" } : undefined}
        onAnimationEnd={(e) => {
          if (e.animationName === "lookback-rise") fireVerdictHaptic();
        }}
      >
        <p style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-body)", color: "var(--text)", lineHeight: "var(--lh-read)", margin: 0 }}>
          <span style={{ fontStyle: "italic", color: "var(--text-dim)" }}>Looking back, {verdict.lookbackLabel} — </span>
          {headline.map((part, i) => (
            <span key={i}>
              {part}
              {i < headline.length - 1 && (
                <span className="tnum" style={{ fontWeight: 600, color: "var(--accent-text)" }}>{money}</span>
              )}
            </span>
          ))}
        </p>
        {/* Figuring — the actual numbers behind the verdict, one size below the
            headline (matching the reflection above); colour carries the hierarchy. */}
        <p style={{ fontSize: "var(--fs-body)", color: "var(--text-dim)", lineHeight: "var(--lh-read)", margin: "var(--space-3) 0 0" }}>{calc}</p>
      </div>
    </div>
  );
}

export function MobileDecisionJournal({
  decisions, selectedId, displayCurrency, onViewDay, rewindId,
}: {
  decisions: Mutation[];
  selectedId: string | null;
  displayCurrency: DisplayCurrency;
  // Rewind affordance: "Portfolio on this day" stands the page (hero +
  // holdings) at this entry's date. The entry itself is the natural place to
  // ask that question — the chart dots are a 5px target. Optional so other
  // mounts of the journal are unaffected.
  onViewDay?: (id: string) => void;
  // The entry currently rewound to (if any) — its action row flips to a quiet
  // confirmation instead of re-offering the jump.
  rewindId?: string | null;
}) {
  // Controlled by the shared selection (a tapped chart dot). When nothing is
  // selected, default to the newest decision so the panel is never empty.
  const index = useMemo(() => {
    const i = decisions.findIndex((d) => d.id === selectedId);
    return i >= 0 ? i : 0;
  }, [decisions, selectedId]);
  const m = decisions[index];

  // Folded by default so Holdings sits high on screen. Explicitly picking a
  // decision from the chart is a drill-in, so that opens the entry — including
  // when the journal MOUNTS with a selection already made (the Overview now
  // rests on an invitation and only mounts the journal on selection, so the
  // first selection arrives as initial props, not as a change). CLEARING the
  // selection ("Back to today" / "Now") folds it back down, so returning to
  // now never leaves an old entry's details standing open. Adjusting `open`
  // when the selection changes is done during render (React's endorsed
  // pattern), not in an effect, so it doesn't trigger a cascading re-render.
  const [open, setOpen] = useState(
    () => !!selectedId && decisions.some((d) => d.id === selectedId),
  );
  const [prevSelected, setPrevSelected] = useState(selectedId);
  if (selectedId !== prevSelected) {
    setPrevSelected(selectedId);
    if (selectedId && decisions.some((d) => d.id === selectedId)) setOpen(true);
    else if (!selectedId) setOpen(false);
  }

  // Verdict — fetched lazily for the selected eligible decision, cached per
  // (mutation, currency); null marks "asked, nothing to show". Fetched even
  // while folded so the look-back chip can render.
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

  // 60-second-hook measurement: the moment a demo visitor first has a verdict
  // on screen (an open entry with its look-back resolved). Once per session,
  // demo accounts only, no properties — nothing identifying leaves the device.
  const { data: subData } = useSubscription();
  const isDemoAccount = subData?.isDemo ?? false;
  useEffect(() => {
    if (!isDemoAccount || !open || !m) return;
    if (!verdicts[`${m.id}|${displayCurrency}`]) return;
    try {
      if (sessionStorage.getItem("volnar:demo-verdict-tracked")) return;
      sessionStorage.setItem("volnar:demo-verdict-tracked", "1");
    } catch { return; }
    track("demo_verdict_seen");
  }, [isDemoAccount, open, m, verdicts, displayCurrency]);

  if (decisions.length === 0 || !m) return null;

  const verdict = verdicts[`${m.id}|${displayCurrency}`];
  const unitLabel = m.asset_type ? unitNoun(m.asset_type) : "units";
  const note = noteFor(m);

  const hasVerdict = !!verdict;

  // Header content — book mark, title and date. A chevron appears only when there
  // is a look-back to drop down.
  const header = (
    <>
      <svg width="15" height="15" viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ color: "var(--accent-text)", flex: "none" }}>
        <path d="M128,88a31.79,31.79,0,0,1,24-24h78a2,2,0,0,1,2,2V194.86a2,2,0,0,1-2.4,2A40,40,0,0,0,224,196H160a32,32,0,0,0-32,32" />
        <path d="M26,196.83V65.91a2,2,0,0,1,2-2h76a32,32,0,0,1,24,24V228a32,32,0,0,0-32-32H32A6,6,0,0,1,26,196.83Z" />
      </svg>
      <span className="font-display" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "var(--fs-subhead)", fontWeight: 600, letterSpacing: "var(--tracking-title)", color: "var(--hero)", lineHeight: "var(--lh-snug)" }}>
        {decisionTitleNode(m)}
      </span>
      <span style={{ flex: "none", fontFamily: "var(--font-numeric)", fontSize: "var(--fs-caption)", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-faint)" }}>
        {shortDate(mDate(m))}
      </span>
      {hasVerdict && (
        <svg width="13" height="13" viewBox="0 0 12 12" aria-hidden style={{ flex: "none", transition: "transform 0.25s ease", transform: open ? "rotate(180deg)" : "none", color: "var(--text-faint)", opacity: 0.7 }}>
          <path d="M2.5 4.5L6 8L9.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </>
  );

  return (
    // Margins are 0 — the entry's surrounding spacing is owned by PortfolioTab.
    <section style={{ margin: 0 }}>
      {/* The top of the entry — book mark, title, date and the full reflection —
          stays fully visible. When there's a look-back, the header row is a toggle
          (chevron) that drops the verdict down below; otherwise it's a plain
          header. The book glyph marks it as a journal entry without a text label. */}
      {hasVerdict ? (
        // A div with button semantics, not a <button>: the title now carries an
        // inline link to the asset (nested interactive content is invalid inside
        // a real button). The link stops propagation, so tapping the name
        // navigates without also toggling the look-back.
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => {
            // Only when the row itself is focused — Enter on the title's inline
            // asset link bubbles here too, and must navigate, not toggle.
            if (e.target !== e.currentTarget) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen((v) => !v);
            }
          }}
          aria-expanded={open}
          aria-label={open ? "Hide the look-back" : "Show the look-back"}
          className="focus-ring"
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", cursor: "pointer", textAlign: "left" }}
        >
          {header}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
          {header}
        </div>
      )}

      {/* The reflection — always shown in full (this is the "top part"). A
          mention of the holding inside the writer's own words becomes an
          inline link to its detail page. */}
      <p style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: "var(--fs-body)", color: "var(--text)", lineHeight: "var(--lh-read)", margin: "var(--space-2) 0 0" }}>
        {linkifyAssetMention(note, displayName(m), m.asset_id)}
      </p>

      {/* Rewind — tap to stand the whole page (hero + holdings) at this
          entry's day. While already standing there the action disappears (the
          dated hero and holdings speak for themselves). Today-dated entries
          have nothing to rewind (the live page IS that day), so they offer
          nothing. The path to the asset itself is the inline mention above,
          not an action here. */}
      {onViewDay && rewindId !== m.id && mDate(m).slice(0, 10) < new Date().toISOString().slice(0, 10) && (
          <button
            type="button"
            onClick={() => onViewDay(m.id)}
            className="font-ui"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, marginTop: "var(--space-2)", cursor: "pointer", fontSize: "var(--fs-caption)", fontWeight: 500, color: "var(--accent-text)" }}
          >
            Portfolio on this day
            <svg width="11" height="11" viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="40" y1="128" x2="216" y2="128" />
              <polyline points="144 56 216 128 144 200" />
            </svg>
          </button>
      )}

      {/* Dropped down — the full look-back verdict (chevron reveals it). */}
      {hasVerdict && open && <VerdictBody key={m.id} verdict={verdict} unitLabel={unitLabel} />}
    </section>
  );
}

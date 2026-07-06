"use client";

import { formatMoney } from "@/lib/money";
import { useDisplayCurrencyState } from "@/lib/hooks";
import { fmtTipDate, type SnapshotPoint, type Range } from "@/components/NetWorthChart";
import type { Mutation } from "@/lib/supabase";
import { firstSnapshotDate, hasSufficientHistory } from "@/lib/networth-history";
import { usePortfolioBuilding } from "@/lib/portfolio-build";

const RANGE_LABEL: Record<Range, string> = {
  "1D": "today",
  "1W": "past week",
  "1M": "past month",
  "3M": "past 3 months",
  "1Y": "past year",
  "3Y": "past 3 years",
  "All": "since inception",
};

// Mirrors the snapshots route's RANGE_DAYS — used to derive the window start
// for the "is there real history at the start of this window?" check.
const RANGE_WINDOW_DAYS: Record<Range, number | null> = {
  "1D": 1,
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "1Y": 365,
  "3Y": 1095,
  "All": null,
};

// A parked rewind: the user picked a decision entry, so the hero stands at
// that day. `total` is the sum of the reconstructed as-of holdings (null
// while the reconstruction loads) — the SAME rows the list below renders, so
// the two can never disagree. Any position that couldn't be valued for the
// day speaks through its own row ("no price record"), not through the number.
export interface HeroRewind {
  date: string;
  total: number | null;
}

interface NetWorthHeroProps {
  netTotal: number;
  range: Range;
  series?: SnapshotPoint[];
  valuesSettled: boolean;
  mutations?: Mutation[];
  liquidOnly: boolean;
  onSetLiquid: (v: boolean) => void;
  // The point under a HELD scrub gesture (already display-currency). Transient
  // by construction — the chart emits null the moment the finger lifts, so the
  // hero springs back to whatever it was showing before (rewind or live).
  scrubPoint?: SnapshotPoint | null;
  rewind?: HeroRewind | null;
  onExitRewind?: () => void;
}

function fmtSelectedDate(dateStr: string): string {
  // Accept both daily ("YYYY-MM-DD") and intraday ISO ("YYYY-MM-DDTHH:mm:...Z")
  // dates — slice to the date part so intraday timestamps still parse.
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtPct(n: number): string {
  return new Intl.NumberFormat("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

// Net worth / Liquid segmented control — a slim iOS-style segmented toggle: a
// recessed track with the active segment lifted on the lighter surface. Kept
// thin on purpose so the reclaimed vertical space stays with the hero chart.
// Track/thumb tones and slimming live in globals.css (.liquid-seg*).
function LiquidToggle({ liquidOnly, onSetLiquid }: { liquidOnly: boolean; onSetLiquid: (v: boolean) => void }) {
  return (
    <div className="liquid-seg font-numeric">
      <button
        type="button"
        onClick={() => onSetLiquid(false)}
        aria-pressed={!liquidOnly}
        className={`liquid-seg-btn${!liquidOnly ? " is-active" : ""}`}
      >
        Net worth
      </button>
      <button
        type="button"
        onClick={() => onSetLiquid(true)}
        aria-pressed={liquidOnly}
        className={`liquid-seg-btn${liquidOnly ? " is-active" : ""}`}
      >
        Liquid
      </button>
    </div>
  );
}

// The hero answers "how much?" for whatever moment the page is standing at.
// Three states, strict precedence:
//   1. Scrub (held) — the value under the finger, captioned with its date. A
//      gesture, not a state: release always springs back to 2 or 3. Anonymous
//      time can be READ but never parked.
//   2. Rewind (parked) — a tapped decision dot stands the whole page at that
//      day: date eyebrow, the reconstructed book's total, "Back to today" out.
//      Named time may persist, because the journal entry below says what it is.
//   3. Live (rest) — the current value with its range delta. The default, and
//      the ONLY state that can show a change pill.
export function NetWorthHero({ netTotal, range, series, valuesSettled, mutations, liquidOnly, onSetLiquid, scrubPoint, rewind, onExitRewind }: NetWorthHeroProps) {
  const { currency: displayCurrency, loaded: currencyLoaded } = useDisplayCurrencyState();
  const building = usePortfolioBuilding();

  const seriesStart = series?.[0];

  // Window start for this range — mirrors the snapshots route's cutoff. For "All"
  // there is no fixed cutoff, so the series' own first point is the window start.
  const windowDays = RANGE_WINDOW_DAYS[range];
  const windowStartDate = windowDays != null
    ? (() => { const d = new Date(); d.setDate(d.getDate() - windowDays); return d.toISOString().slice(0, 10); })()
    : (seriesStart?.date ?? null);

  // True only when a real snapshot already existed at/before the window start —
  // i.e. this comparison reflects market history, not the moment data entry began.
  // Now that backfill writes real history back to each asset's acquisition date,
  // `series[0]` already IS that historical anchor — no reconstructed fallback needed.
  const sufficientHistory =
    series != null && series.length >= 2 && windowStartDate != null && hasSufficientHistory(series, windowStartDate);

  // Any mutation that actually changed a holding's recorded value or unit count —
  // an add, a remove, a quantity top-up, or a cost-basis correction — is a flow
  // or a data-entry edit, not a market return. If one falls in the compared
  // window, the delta is partly data entry — never present that as a percentage.
  const todayStr = new Date().toISOString().slice(0, 10);
  const compareEnd = todayStr;
  const includesHoldingsChange =
    seriesStart != null &&
    (mutations ?? []).some((m) => {
      const valueChanged = m.before_value !== m.after_value;
      const unitsChanged = m.before_units !== m.after_units;
      if (!valueChanged && !unitsChanged) return false;
      // Window membership is decided by WHEN THE HOLDING CHANGE HAPPENED
      // (occurred_at = buy_date), never by when the row was recorded — a
      // historically-acquired position imported today must register as a
      // flow into the window containing its acquisition date, not into
      // whatever recent window happens to contain the import.
      const day = m.occurred_at?.slice(0, 10);
      if (!day) return false;
      return day >= seriesStart.date && day <= compareEnd;
    });

  // Range change — series[0] to netTotal (inherits whichever range the chart is on)
  const baseValue = seriesStart?.total_value;
  const rangeAbs =
    baseValue != null && baseValue > 0 && series && series.length >= 2
      ? netTotal - baseValue
      : null;
  const rangePct =
    rangeAbs != null && baseValue != null && baseValue > 0
      ? (rangeAbs / baseValue) * 100
      : null;

  // Intraday liquid (1D): series[0] is today's open and netTotal is now, so the
  // existing delta math already yields the genuine intraday move — show the
  // percentage without the sufficientHistory gate.
  const isIntradayLiquid = range === "1D" && liquidOnly;
  // Suppress the percentage when the base is too small to be meaningful, when
  // there isn't enough real history to anchor it, or when holdings changed —
  // never present data entry as a return.
  const showPct = isIntradayLiquid
    ? true
    : (seriesStart?.total_value ?? 1000) >= 1000 && sufficientHistory && !includesHoldingsChange;

  const activeAbs = rangeAbs;
  const activePct = rangePct;
  const isPositive = activeAbs != null ? activeAbs >= 0 : true;
  const scrubbing = scrubPoint != null;
  // Strict precedence: held scrub > parked rewind > live. Null only while a
  // rewind's reconstruction is still loading (renders as a skeleton, never 0).
  const displayValue = scrubbing ? scrubPoint.total_value : rewind ? rewind.total : netTotal;

  const earliestDate = series ? firstSnapshotDate(series) : null;
  const label = isIntradayLiquid
    ? RANGE_LABEL[range]
    : !sufficientHistory && earliestDate != null
      ? `since ${fmtSelectedDate(earliestDate)}`
      : RANGE_LABEL[range];

  if (!currencyLoaded || !valuesSettled) {
    return (
      <div>
        <LiquidToggle liquidOnly={liquidOnly} onSetLiquid={onSetLiquid} />
        <div
          className="bg-surface-elev rounded-lg animate-pulse"
          style={{ height: 42, width: "60%", maxWidth: 280 }}
        />
      </div>
    );
  }

  const sign = isPositive ? "" : "−";
  // activeAbs and displayValue both already arrive in the display currency
  // (the chart series and live netTotal are converted natively, never via
  // USD), so format with from === to (identity, no rate lookup).
  const formattedAbs = activeAbs != null ? formatMoney(Math.abs(activeAbs), displayCurrency, displayCurrency) : null;
  const formattedPct = activePct != null ? fmtPct(Math.abs(activePct)) : null;

  return (
    <div>
      {/* Top slot follows the PARKED state (stable through a held scrub):
          rewound → the day's date as an eyebrow; otherwise the Net worth /
          Liquid segmented toggle. minHeight matches the toggle so swapping
          modes doesn't jolt the chart below. */}
      {rewind ? (
        <div
          className="eyebrow"
          style={{ color: "var(--accent-text)", display: "flex", alignItems: "center", minHeight: 25, marginBottom: "var(--space-3)" }}
        >
          {fmtSelectedDate(rewind.date)}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap", minHeight: 25, marginBottom: "var(--space-3)" }}>
          <LiquidToggle liquidOnly={liquidOnly} onSetLiquid={onSetLiquid} />
          {/* While a past-dated add rebuilds the history, mark the chart as still
              filling in — clears itself when the rebuild lands. */}
          {building && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--fs-caption)", color: "var(--text-dim)" }}>
              <span className="chat-build-spinner" aria-hidden />
              Building your history…
            </span>
          )}
        </div>
      )}

      {/* Hero number — monochrome. Rewound at rest it steps down from the hero
          tone (this is a reconstruction, not your money right now). */}
      {displayValue == null ? (
        <div
          className="bg-surface-elev rounded-lg animate-pulse"
          style={{ height: 42, width: "60%", maxWidth: 280 }}
        />
      ) : (
        <div
          className="font-display leading-none"
          style={{
            fontSize: "var(--fs-hero)",
            fontWeight: 600,
            letterSpacing: "var(--tracking-hero)",
            color: rewind && !scrubbing ? "var(--text)" : "var(--hero)",
            fontVariationSettings: "'opsz' 48",
          }}
        >
          <span>{formatMoney(displayValue, displayCurrency, displayCurrency)}</span>
        </div>
      )}

      {/* The line under the number follows the same precedence as the number:
          held scrub → the held point's dateline; parked rewind → the way back
          ("Back to today") + what this number is; live → the change pill. */}
      {scrubbing ? (
        <div style={{ display: "flex", alignItems: "center", marginTop: "var(--space-2)" }}>
          <span className="tnum" style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: "var(--radius-pill)", fontSize: "var(--fs-meta)", fontWeight: 500, background: "var(--surface-elev)", color: "var(--text-dim)" }}>
            {fmtTipDate(scrubPoint.date)}
          </span>
        </div>
      ) : rewind ? (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-2)" }}>
          <button
            type="button"
            onClick={onExitRewind}
            className="tnum"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: "var(--radius-pill)", fontSize: "var(--fs-meta)", fontWeight: 500, background: "none", border: "0.5px solid var(--border)", color: "var(--accent-text)", cursor: "pointer" }}
          >
            ← Back to today
          </button>
          <span style={{ color: "var(--text-faint)", fontSize: "var(--fs-caption)", fontFamily: "var(--font-numeric)" }}>reconstructed from your records</span>
        </div>
      ) : (
        /* Change pill — compact tinted, mirrors the asset-detail delta pill */
        formattedAbs != null && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-2)" }}>
            <span className="tnum" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: "var(--radius-pill)", fontSize: "var(--fs-meta)", fontWeight: 500, background: isPositive ? "var(--positive-soft)" : "var(--negative-soft)", color: isPositive ? "var(--positive-text)" : "var(--negative-text)" }}>
              <svg width="10" height="10" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
                {isPositive ? <path d="M216,72v96a8,8,0,0,1-8,8H112a8,8,0,0,1-5.66-13.66L208,60.69Z" /> : <path d="M216,184v-96a8,8,0,0,0-8-8H112a8,8,0,0,0-5.66,13.66L208,195.31Z" />}
              </svg>
              {sign}{formattedAbs}{showPct && formattedPct != null ? ` (${formattedPct}%)` : ""}
            </span>
            <span style={{ color: "var(--text-faint)", fontSize: "var(--fs-caption)", fontFamily: "var(--font-numeric)" }}>{label}</span>
          </div>
        )
      )}
    </div>
  );
}

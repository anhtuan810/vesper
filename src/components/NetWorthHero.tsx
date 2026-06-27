"use client";

import { formatMoney } from "@/lib/money";
import { useDisplayCurrencyState } from "@/lib/hooks";
import type { SnapshotPoint, Range } from "@/components/NetWorthChart";
import type { Mutation } from "@/lib/supabase";
import { firstSnapshotDate, hasSufficientHistory } from "@/lib/networth-history";

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

interface NetWorthHeroProps {
  netTotal: number;
  range: Range;
  selectedPoint?: SnapshotPoint | null;
  series?: SnapshotPoint[];
  valuesSettled: boolean;
  mutations?: Mutation[];
  liquidOnly: boolean;
  onSetLiquid: (v: boolean) => void;
}

function fmtSelectedDate(dateStr: string): string {
  // Accept both daily ("YYYY-MM-DD") and intraday ISO ("YYYY-MM-DDTHH:mm:...Z")
  // dates — slice to the date part so intraday timestamps still parse.
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// Intraday (1D) scrub label — full weekday + date and the bar's wall-clock time
// in the viewer's local zone (e.g. "Sat, 14 Jun 2026, 14:35").
function fmtSelectedDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtPct(n: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function NetWorthHero({ netTotal, range, selectedPoint, series, valuesSettled, mutations, liquidOnly, onSetLiquid }: NetWorthHeroProps) {
  const { currency: displayCurrency, loaded: currencyLoaded } = useDisplayCurrencyState();

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
  const compareEnd = selectedPoint?.date ?? todayStr;
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

  // Scrub change — series[0] to selectedPoint
  const selAbs =
    selectedPoint != null && seriesStart != null
      ? selectedPoint.total_value - seriesStart.total_value
      : null;
  const selPct =
    selAbs != null && seriesStart != null && seriesStart.total_value !== 0
      ? (selAbs / seriesStart.total_value) * 100
      : null;
  const showSelected = selectedPoint != null && selAbs != null && selPct != null;

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

  const activeAbs = showSelected ? selAbs! : rangeAbs;
  const activePct = showSelected ? selPct! : rangePct;
  const isPositive = activeAbs != null ? activeAbs >= 0 : true;
  const displayValue = selectedPoint != null ? selectedPoint.total_value : netTotal;

  const earliestDate = series ? firstSnapshotDate(series) : null;
  const label = selectedPoint != null
    ? (isIntradayLiquid ? fmtSelectedDateTime(selectedPoint.date) : fmtSelectedDate(selectedPoint.date))
    : isIntradayLiquid
      ? RANGE_LABEL[range]
      : !sufficientHistory && earliestDate != null
        ? `since ${fmtSelectedDate(earliestDate)}`
        : RANGE_LABEL[range];
  const annotation = !showSelected && !showPct && includesHoldingsChange ? " · includes added holdings" : "";

  if (!currencyLoaded || !valuesSettled) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <button onClick={() => onSetLiquid(false)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 15, fontWeight: liquidOnly ? 500 : 600, color: liquidOnly ? "var(--text-faint)" : "var(--text)" }}>Net worth</button>
          <span style={{ width: 3, height: 3, borderRadius: 999, background: "var(--text-faint)", opacity: 0.6 }} />
          <button onClick={() => onSetLiquid(true)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 15, fontWeight: liquidOnly ? 600 : 500, color: liquidOnly ? "var(--text)" : "var(--text-faint)" }}>Liquid</button>
        </div>
        <div
          className="bg-surface-elev rounded-lg animate-pulse"
          style={{ height: 56, width: "60%", maxWidth: 280 }}
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
      {/* Eyebrow toggle — "Net worth · Liquid"; active word inks/600, inactive
          faints/500. Drives liquidOnly (number/series/delta already follow it). */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button onClick={() => onSetLiquid(false)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 15, fontWeight: liquidOnly ? 500 : 600, color: liquidOnly ? "var(--text-faint)" : "var(--text)" }}>Net worth</button>
        <span style={{ width: 3, height: 3, borderRadius: 999, background: "var(--text-faint)", opacity: 0.6 }} />
        <button onClick={() => onSetLiquid(true)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 15, fontWeight: liquidOnly ? 600 : 500, color: liquidOnly ? "var(--text)" : "var(--text-faint)" }}>Liquid</button>
      </div>

      {/* Hero number — serif, monochrome */}
      <div
        className="font-serif leading-none"
        style={{
          fontSize: 54,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: "var(--hero)",
          fontVariationSettings: "'opsz' 60",
        }}
      >
        <span>{formatMoney(displayValue, displayCurrency, displayCurrency)}</span>
      </div>

      {/* Change pill — compact tinted, mirrors the asset-detail delta pill */}
      {formattedAbs != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 999, fontSize: 13, fontWeight: 500, fontFamily: "var(--mono)", fontFeatureSettings: '"tnum" 1', background: isPositive ? "var(--positive-soft)" : "var(--negative-soft)", color: isPositive ? "var(--positive-text)" : "var(--negative-text)" }}>
            <svg width="10" height="10" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
              {isPositive ? <path d="M216,72v96a8,8,0,0,1-8,8H112a8,8,0,0,1-5.66-13.66L208,60.69Z" /> : <path d="M216,184v-96a8,8,0,0,0-8-8H112a8,8,0,0,0-5.66,13.66L208,195.31Z" />}
            </svg>
            {sign}{formattedAbs}{showPct && formattedPct != null ? ` (${formattedPct}%)` : ""}
          </span>
          <span style={{ color: "var(--text-faint)", fontSize: 13, fontFamily: "var(--mono)" }}>{label}{annotation}</span>
        </div>
      )}
    </div>
  );
}

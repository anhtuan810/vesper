"use client";

import { formatMoney } from "@/lib/money";
import { useDisplayCurrencyState } from "@/lib/hooks";
import type { SnapshotPoint, Range } from "@/components/NetWorthChart";

const RANGE_LABEL: Record<Range, string> = {
  "1W": "past week",
  "1M": "past month",
  "3M": "past 3 months",
  "1Y": "past year",
  "All": "since inception",
};

interface NetWorthHeroProps {
  netTotal: number;
  range: Range;
  selectedPoint?: SnapshotPoint | null;
  series?: SnapshotPoint[];
}

function fmtSelectedDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
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

export function NetWorthHero({ netTotal, range, selectedPoint, series }: NetWorthHeroProps) {
  const { currency: displayCurrency, loaded: currencyLoaded } = useDisplayCurrencyState();

  const seriesStart = series?.[0];

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

  // Suppress percentage when the base is too small to produce a meaningful rate
  const showPct = (seriesStart?.total_value ?? 1000) >= 1000;

  const activeAbs = showSelected ? selAbs! : rangeAbs;
  const activePct = showSelected ? selPct! : rangePct;
  const isPositive = activeAbs != null ? activeAbs >= 0 : true;
  const displayValue = selectedPoint != null ? selectedPoint.total_value : netTotal;

  const label = selectedPoint != null
    ? fmtSelectedDate(selectedPoint.date)
    : RANGE_LABEL[range];

  if (!currencyLoaded) {
    return (
      <div>
        <div className="text-dim mb-[14px]" style={{ fontSize: 14 }}>
          Total net worth
        </div>
        <div
          className="bg-surface-elev rounded-lg animate-pulse"
          style={{ height: 56, width: "60%", maxWidth: 280 }}
        />
      </div>
    );
  }

  const sign = isPositive ? "" : "−";
  const formattedAbs = activeAbs != null ? formatMoney(Math.abs(activeAbs), displayCurrency) : null;
  const formattedPct = activePct != null ? fmtPct(Math.abs(activePct)) : null;

  return (
    <div>
      <div className="text-dim mb-[14px]" style={{ fontSize: 14 }}>
        Total net worth
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
        <span>{formatMoney(displayValue, displayCurrency)}</span>
      </div>

      {/* Change line — IBKR-style plain text, no pill */}
      {formattedAbs != null && (
        <div style={{ fontSize: 15, lineHeight: 1.4, marginTop: 14 }}>
          <span
            style={{
              fontWeight: 500,
              color: isPositive ? "var(--positive-text)" : "var(--negative-text)",
            }}
          >
            {sign}{formattedAbs}{showPct && formattedPct != null ? ` (${formattedPct}%)` : ""}
          </span>
          <span style={{ color: "var(--text)", marginLeft: 6 }}>
            {label}
          </span>
        </div>
      )}
    </div>
  );
}

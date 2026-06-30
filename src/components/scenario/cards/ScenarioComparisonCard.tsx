"use client";

import { formatMoney } from "@/lib/money";
import type { DisplayCurrency } from "@/lib/money";
import type { ScenarioVitalDelta } from "@/lib/scenario/result";

// Prop-driven "current vs scenario" readout card — the single whole-portfolio
// before->after answer for portfolio-changing what-ifs (also reused by the parked
// Adjust/Stress surfaces). Every figure arrives via props as USD; formatting to the
// display currency happens here.

export interface ComparisonReadout {
  netWorthUsd: number;
  allocationByCategory: Array<{ category: string; valueUsd: number; pct: number }>;
  topSingleNameConcentrationPct: number | null;
  leverage: { ltvPct: number } | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  property: "Property",
  markets: "Public markets",
  reserves: "Reserves",
  crypto: "Crypto",
};
const CATEGORY_COLOR: Record<string, string> = {
  property: "var(--category-property)",
  markets: "var(--category-public-markets)",
  reserves: "var(--category-reserves)",
  crypto: "var(--category-crypto)",
};
const CATEGORY_ORDER = ["markets", "property", "crypto", "reserves"];
const BAND_COLOR: Record<string, string> = { green: "var(--positive-text)", amber: "var(--accent-text)", red: "var(--negative-text)" };

interface ScenarioComparisonCardProps {
  current: ComparisonReadout;
  scenario: ComparisonReadout;
  displayCurrency: DisplayCurrency;
  /** Eyebrow label above the card. */
  title?: string;
  /** Label above the net-worth figure. */
  netWorthLabel?: string;
  /** "signed" = sign-aware +/− coloured delta (Adjust); "drop" = always-negative delta with percent (Stress). */
  deltaStyle?: "signed" | "drop";
  /** Show the single-name concentration row. */
  showConcentration?: boolean;
  /** Show the prominent mortgage-LTV callout (when both readouts carry leverage). */
  showLtvCallout?: boolean;
  /** Eyebrow above the allocation rows. */
  allocationLabel?: string;
  /** Top margin (px) on the allocation eyebrow. */
  allocationMarginTop?: number;
  /** Render a before/after stacked allocation bar that visibly shifts. */
  allocationBar?: boolean;
  /** Up-to-two contextual vitals (drawdown / leverage / liquidity), before->after. */
  contextualVitals?: ScenarioVitalDelta[];
  /** Optional footer slot (e.g. a Discuss affordance, an estimate note). */
  footer?: React.ReactNode;
}

function AllocationBar({ alloc }: { alloc: Map<string, { pct: number }> }) {
  const segs = CATEGORY_ORDER.map((cat) => ({ cat, pct: Math.max(0, alloc.get(cat)?.pct ?? 0) })).filter((s) => s.pct > 0.5);
  return (
    <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "var(--surface-elev)" }}>
      {segs.map((s) => (
        <div key={s.cat} title={`${CATEGORY_LABEL[s.cat] ?? s.cat} ${s.pct.toFixed(0)}%`} style={{ width: `${s.pct}%`, background: CATEGORY_COLOR[s.cat] ?? "var(--accent)" }} />
      ))}
    </div>
  );
}

export function ScenarioComparisonCard({
  current,
  scenario,
  displayCurrency,
  title = "Comparison",
  netWorthLabel = "Net worth",
  deltaStyle = "signed",
  showConcentration = true,
  showLtvCallout = false,
  allocationLabel = "Allocation by category",
  allocationMarginTop = 14,
  allocationBar = false,
  contextualVitals,
  footer,
}: ScenarioComparisonCardProps) {
  const m = (usd: number) => formatMoney(usd, "USD", displayCurrency);
  const fmtPct = (n: number | null): string =>
    n == null ? "—" : new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n) + "%";

  const c = current;
  const s = scenario;
  const nwDelta = s.netWorthUsd - c.netWorthUsd;
  const dropPct = c.netWorthUsd !== 0 ? (nwDelta / c.netWorthUsd) * 100 : 0;

  const allocCats = (() => {
    const set = new Set<string>();
    c.allocationByCategory.forEach((x) => set.add(x.category));
    s.allocationByCategory.forEach((x) => set.add(x.category));
    return CATEGORY_ORDER.filter((cat) => set.has(cat));
  })();
  const curAlloc = new Map(c.allocationByCategory.map((x) => [x.category, x]));
  const scnAlloc = new Map(s.allocationByCategory.map((x) => [x.category, x]));

  const hasLeverage = !!(c.leverage && s.leverage);

  return (
    <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "16px 16px 8px" }}>
      <div style={{ ...eyebrowStyle, marginBottom: 14 }}>{title}</div>

      {/* Net worth */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 4 }}>{netWorthLabel}</div>
          <div className="font-display" style={{ fontSize: 30, fontWeight: 600, letterSpacing: "var(--tracking-hero)", color: "var(--hero)", lineHeight: 1 }}>
            {m(s.netWorthUsd)}
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: 13 }}>
          <div style={{ color: "var(--text-faint)", fontFamily: "var(--font-numeric)" }}>{m(c.netWorthUsd)} now</div>
          {deltaStyle === "drop" ? (
            <div style={{ fontWeight: 500, color: "var(--negative-text)", marginTop: 2, fontFamily: "var(--font-numeric)" }}>
              −{m(Math.abs(nwDelta))} ({fmtPct(Math.abs(dropPct))})
            </div>
          ) : (
            <div style={{ fontWeight: 500, color: nwDelta >= 0 ? "var(--positive-text)" : "var(--negative-text)", marginTop: 2, fontFamily: "var(--font-numeric)" }}>
              {nwDelta >= 0 ? "+" : "−"}{m(Math.abs(nwDelta))}
            </div>
          )}
        </div>
      </div>

      {/* Single-name concentration */}
      {showConcentration && (
        <div style={statRowStyle}>
          <span style={{ fontSize: 13, color: "var(--text)" }}>Single-name concentration</span>
          <span style={{ fontSize: 13, color: "var(--text-dim)", fontFamily: "var(--font-numeric)" }}>
            {fmtPct(c.topSingleNameConcentrationPct)} <span style={{ color: "var(--text-faint)" }}>→</span>{" "}
            <span style={{ color: "var(--text)", fontWeight: 500 }}>{fmtPct(s.topSingleNameConcentrationPct)}</span>
          </span>
        </div>
      )}

      {/* LTV callout — the sharper read for leveraged property */}
      {showLtvCallout && hasLeverage && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", marginBottom: 12, borderRadius: "var(--radius-md)", background: "var(--negative-soft)" }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--negative-text)" }}>Mortgage LTV</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--negative-text)", fontFamily: "var(--font-numeric)" }}>
            {fmtPct(c.leverage!.ltvPct)} <span style={{ opacity: 0.6 }}>→</span> {fmtPct(s.leverage!.ltvPct)}
          </span>
        </div>
      )}

      {/* Allocation by category */}
      <div style={{ ...eyebrowStyle, fontSize: 11, margin: `${allocationMarginTop}px 0 6px` }}>{allocationLabel}</div>

      {/* Before/after stacked bars that visibly shift */}
      {allocationBar && (
        <div style={{ margin: "2px 0 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--space-1)" }}>
            <span style={{ width: 34, fontSize: 12, color: "var(--text-faint)" }}>Now</span>
            <div style={{ flex: 1 }}><AllocationBar alloc={curAlloc} /></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 34, fontSize: 12, color: "var(--text-faint)" }}>After</span>
            <div style={{ flex: 1 }}><AllocationBar alloc={scnAlloc} /></div>
          </div>
        </div>
      )}

      {allocCats.map((cat) => (
        <div key={cat} style={statRowStyle}>
          <span style={{ fontSize: 13, color: "var(--text)" }}>{CATEGORY_LABEL[cat] ?? cat}</span>
          <span style={{ fontSize: 13, color: "var(--text-dim)", fontFamily: "var(--font-numeric)" }}>
            {fmtPct(curAlloc.get(cat)?.pct ?? 0)} <span style={{ color: "var(--text-faint)" }}>→</span>{" "}
            <span style={{ color: "var(--text)", fontWeight: 500 }}>{fmtPct(scnAlloc.get(cat)?.pct ?? 0)}</span>
          </span>
        </div>
      ))}

      {/* Contextual vitals that moved materially — before -> after */}
      {contextualVitals && contextualVitals.length > 0 && (
        <>
          <div style={{ ...eyebrowStyle, fontSize: 11, margin: "14px 0 6px" }}>What this moves</div>
          {contextualVitals.map((v) => (
            <div key={v.key} style={statRowStyle}>
              <span style={{ fontSize: 13, color: "var(--text)" }}>{v.label}</span>
              <span style={{ fontSize: 13, color: "var(--text-dim)", fontFamily: "var(--font-numeric)" }}>
                {v.before} <span style={{ color: "var(--text-faint)" }}>→</span>{" "}
                <span style={{ fontWeight: 600, color: BAND_COLOR[v.afterBand] ?? "var(--text)" }}>{v.after}</span>
              </span>
            </div>
          ))}
        </>
      )}

      {footer}
    </div>
  );
}

const eyebrowStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  fontFamily: "var(--font-numeric)", letterSpacing: "var(--tracking-label)",
  textTransform: "uppercase",
  color: "var(--text-faint)",
};
const statRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "var(--space-2) 0",
  borderBottom: "0.5px solid var(--border)",
};

"use client";

import { useMemo } from "react";
import { computeCurrentBalance, projectMortgage, formatTimeRemaining, formatPayoffDate } from "@/lib/mortgage";
import { useDisplayCurrency } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";
import type { RealEstateAsset } from "@/lib/supabase";

interface Props {
  asset: RealEstateAsset;
}

function buildPayoffPath(
  curve: { date: Date; balance: number }[],
  todayIdx: number,
  W: number,
  H: number,
): { line: string; area: string; todayX: number; todayY: number } {
  if (curve.length < 2) return { line: "", area: "", todayX: 0, todayY: 0 };

  const pad = 4;
  const maxBalance = curve[0].balance;
  const toX = (i: number) => (i / (curve.length - 1)) * W;
  const toY = (b: number) => H - pad - (b / maxBalance) * (H - pad * 2);
  const pts = curve.map((p, i) => ({ x: toX(i), y: toY(p.balance) }));

  let line = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const mx = ((pts[i].x + pts[i + 1].x) / 2).toFixed(1);
    const my = ((pts[i].y + pts[i + 1].y) / 2).toFixed(1);
    line += ` Q ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)} ${mx} ${my}`;
  }
  line += ` L ${pts[pts.length - 1].x.toFixed(1)} ${H}`;
  const area = line + ` L 0 ${H} Z`;

  let strokeLine = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const mx = ((pts[i].x + pts[i + 1].x) / 2).toFixed(1);
    const my = ((pts[i].y + pts[i + 1].y) / 2).toFixed(1);
    strokeLine += ` Q ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)} ${mx} ${my}`;
  }
  strokeLine += ` L ${pts[pts.length - 1].x.toFixed(1)} ${H}`;

  const ti = Math.min(todayIdx, pts.length - 1);
  return { line: strokeLine, area, todayX: pts[ti].x, todayY: pts[ti].y };
}

export function MortgageBlock({ asset }: Props) {
  const displayCurrency = useDisplayCurrency();
  const {
    mortgage_rate: rate,
    monthly_payment: payment,
    mortgage_type: type,
    mortgage_start_date: startStr,
    mortgage_end_date: endStr,
  } = asset;

  const balance = computeCurrentBalance(asset);
  const hasMortgage = balance > 0;
  const hasProjection = hasMortgage && rate != null && payment != null && type != null && startStr != null;

  const projection = useMemo(() => {
    if (!hasProjection) return null;
    return projectMortgage(balance, rate!, payment!, type!, new Date(startStr!), new Date(), endStr ? new Date(endStr) : undefined);
  }, [hasProjection, balance, rate, payment, type, startStr, endStr]);

  const { curve, todayIdx } = useMemo(() => {
    if (!projection) return { curve: [] as { date: Date; balance: number }[], todayIdx: 0 };
    const c = projection.balanceCurve;
    const today = new Date();
    let idx = 0; let minDiff = Infinity;
    c.forEach((p, i) => {
      const diff = Math.abs(p.date.getTime() - today.getTime());
      if (diff < minDiff) { minDiff = diff; idx = i; }
    });
    return { curve: c, todayIdx: idx };
  }, [projection]);

  if (!hasMortgage) return null;

  const W = 320;
  const H = 80;
  const gradId = `payoff_${asset.id}`;
  const strokeColor = "var(--accent)";
  const startDate = startStr ? new Date(startStr) : null;
  const { line, area, todayX, todayY } = buildPayoffPath(curve, todayIdx, W, H);
  const startYear = startDate ? startDate.getFullYear().toString() : "";
  const endYear = projection?.payoffDate ? projection.payoffDate.getFullYear().toString() : "";

  const typeLabel = type === "annuity" ? "Annuity"
    : type === "linear" ? "Linear"
    : type === "interest_only" ? "Interest only"
    : type ?? "—";

  const mortgageFreeDate = projection?.payoffDate
    ? new Date(projection.payoffDate).toLocaleDateString("en-GB", { month: "short", year: "numeric" })
    : endStr ?? "—";

  const yearsToGo = projection?.remainingMonths
    ? Math.round(projection.remainingMonths / 12)
    : null;

  const rows = [
    { label: "Balance", value: formatMoney(balance, displayCurrency), meta: null },
    { label: "Rate", value: rate != null ? `${rate.toFixed(1)}%` : "—", meta: null },
    { label: "Payment", value: payment != null ? formatMoney(payment, displayCurrency) : "—", meta: "per month" },
    { label: "Type", value: typeLabel, meta: null },
    { label: "Mortgage-free", value: mortgageFreeDate, meta: yearsToGo != null ? `${yearsToGo} years to go` : null },
  ];

  return (
    <>
      {/* Stat list */}
      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 14, overflow: "hidden", marginBottom: 0 }}>
        {rows.map((row, idx) => (
          <div key={row.label} style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 16px",
            borderBottom: idx < rows.length - 1 ? "0.5px solid var(--border)" : "none",
            gap: 14,
          }}>
            <span style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 500, flexShrink: 0 }}>{row.label}</span>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 500, color: "var(--hero)", letterSpacing: "-0.005em", fontFeatureSettings: '"tnum" 1', fontVariationSettings: "'opsz' 18", lineHeight: 1.1 }}>
                {row.value}
              </span>
              {row.meta && (
                <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-faint)", letterSpacing: "0.01em", fontFeatureSettings: '"tnum" 1' }}>
                  {row.meta}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Payoff chart — attached visually to the stat list */}
      {projection && curve.length >= 2 && (
        <div style={{
          background: "var(--surface)",
          border: "0.5px solid var(--border)",
          borderRadius: 14,
          padding: 12,
          marginTop: -8,
          paddingTop: 20,
        }}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: "block" }}>
            <defs>
              <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={strokeColor} stopOpacity={0.18} />
                <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gradId})`} />
            <path d={line} fill="none" stroke={strokeColor} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            {todayX > 0 && (
              <>
                <line x1={todayX} y1={0} x2={todayX} y2={H} stroke="var(--text)" strokeWidth={0.5} strokeDasharray="3 3" opacity={0.35} />
                <circle cx={todayX} cy={todayY} r={3.5} fill={strokeColor} />
              </>
            )}
          </svg>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 8,
            padding: "0 2px",
            fontSize: 11,
            color: "var(--text-faint)",
            fontFeatureSettings: '"tnum" 1',
            fontFamily: "var(--font-sans)",
          }}>
            <span>{startYear}</span>
            <span style={{
              background: "var(--accent-soft)",
              color: "var(--accent-text)",
              fontWeight: 500,
              padding: "2px 8px",
              borderRadius: 999,
              fontSize: 10,
              letterSpacing: "0.04em",
            }}>
              TODAY
            </span>
            <span>{endYear}</span>
          </div>
        </div>
      )}
    </>
  );
}

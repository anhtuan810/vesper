"use client";

import { useMemo, useState } from "react";
import { computeCurrentBalance, projectMortgage, annuityPayment, monthsBetween, type MortgageProjection } from "@/lib/mortgage";
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
  // Index of the scrubbed point on the projected-balance curve (null = not scrubbing).
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);
  const {
    mortgage_rate: rate,
    monthly_payment: payment,
    mortgage_type: type,
    mortgage_start_date: startStr,
    mortgage_end_date: endStr,
    buy_date: buyDateStr,
  } = asset;

  const balance = computeCurrentBalance(asset);
  const hasMortgage = balance > 0;

  // The amortisation timeline requires a REAL start date: the stated mortgage
  // start, or the acquisition (buy) date. We deliberately do NOT fall back to
  // mortgage_balance_recorded_at (record-creation time), which would anchor the
  // payoff to when the row happened to be created.
  const realStartStr = startStr ?? buyDateStr ?? null;

  const { projection, renderState, effectivePayment } = useMemo<{
    projection: MortgageProjection | null;
    renderState: "ok" | "start_date_missing" | "payment_not_set" | "payment_below_interest";
    effectivePayment: number | null;
  }>(() => {
    if (!hasMortgage || rate == null || type == null) {
      return { projection: null, renderState: "ok", effectivePayment: payment ?? null };
    }
    if (!realStartStr) {
      return { projection: null, renderState: "start_date_missing", effectivePayment: payment ?? null };
    }
    const startDate = new Date(realStartStr);
    const endDate = endStr ? new Date(endStr) : undefined;

    // Use the stated payment; if absent, derive the contractual annuity payment
    // ONLY when a full term (end date) is known. Never fabricate a payment otherwise.
    let pmt: number | null = payment ?? null;
    if (pmt == null && type !== "interest_only") {
      if (endDate && balance > 0) {
        const rem = monthsBetween(new Date(), endDate);
        if (rem > 0) pmt = annuityPayment(balance, rate, rem);
      }
      if (pmt == null) {
        return { projection: null, renderState: "payment_not_set", effectivePayment: null };
      }
    }

    const proj = projectMortgage(balance, rate, pmt ?? 0, type, startDate, new Date(), endDate);
    return {
      projection: proj,
      renderState: proj.status === "payment_below_interest" ? "payment_below_interest" : "ok",
      effectivePayment: pmt,
    };
  }, [hasMortgage, rate, type, payment, realStartStr, endStr, balance]);

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

  // The payoff curve is only meaningful for a real, amortising schedule.
  const showCurve = renderState === "ok" && !!projection && curve.length >= 2;

  const W = 320;
  const H = 80;
  const gradId = `payoff_${asset.id}`;
  const strokeColor = "var(--accent)";
  const startDate = realStartStr ? new Date(realStartStr) : null;
  const { line, area, todayX, todayY } = buildPayoffPath(curve, todayIdx, W, H);
  const startYear = startDate ? startDate.getFullYear().toString() : "";
  const endYear = projection?.payoffDate ? projection.payoffDate.getFullYear().toString() : "";

  // Scrub geometry — snaps to the nearest point on the projected-balance series,
  // using the SAME toX/toY mapping as buildPayoffPath so the marker sits on the
  // curve. Reading the series only; no mortgage math is recomputed.
  const SCRUB_PAD = 4;
  const scrubMaxBalance = curve.length >= 2 ? (curve[0].balance || 1) : 1;
  const scrubI = showCurve && scrubIdx != null ? Math.min(scrubIdx, curve.length - 1) : null;
  const scrubX = scrubI != null ? (scrubI / (curve.length - 1)) * W : null;
  const scrubY = scrubI != null ? H - SCRUB_PAD - (curve[scrubI].balance / scrubMaxBalance) * (H - SCRUB_PAD * 2) : null;
  const handleScrub = (clientX: number, rect: DOMRect) => {
    if (curve.length < 2 || rect.width <= 0) return;
    const relX = (clientX - rect.left) / rect.width;
    setScrubIdx(Math.min(Math.max(Math.round(relX * (curve.length - 1)), 0), curve.length - 1));
  };

  const typeLabel = type === "annuity" ? "Annuity"
    : type === "linear" ? "Linear"
    : type === "interest_only" ? "Interest only"
    : type ?? "—";

  // The "Mortgage-free" row reflects the projection state: a real payoff date, or
  // a neutral reason when the timeline can't be computed (no fabricated payoff).
  let mortgageFreeValue: string;
  let mortgageFreeMeta: string | null;
  if (renderState === "start_date_missing") {
    mortgageFreeValue = "Not set";
    mortgageFreeMeta = "start date not set";
  } else if (renderState === "payment_not_set") {
    mortgageFreeValue = "—";
    mortgageFreeMeta = "payment not set";
  } else if (renderState === "payment_below_interest") {
    mortgageFreeValue = "—";
    mortgageFreeMeta = "payment doesn't cover interest";
  } else {
    mortgageFreeValue = projection?.payoffDate
      ? new Date(projection.payoffDate).toLocaleDateString("en-GB", { month: "short", year: "numeric" })
      : "—";
    const ytg = projection && projection.remainingMonths > 0
      ? Math.round(projection.remainingMonths / 12)
      : null;
    mortgageFreeMeta = ytg != null ? `${ytg} years to go` : null;
  }

  const rows = [
    { label: "Balance", value: formatMoney(balance, asset.currency || "USD", displayCurrency), meta: null },
    { label: "Rate", value: rate != null ? `${rate.toFixed(2)}%` : "—", meta: null },
    { label: "Payment", value: effectivePayment != null ? formatMoney(effectivePayment, asset.currency || "USD", displayCurrency) : "Not set", meta: effectivePayment != null ? "per month" : null },
    { label: "Type", value: typeLabel, meta: null },
    { label: "Mortgage-free", value: mortgageFreeValue, meta: mortgageFreeMeta },
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
      {showCurve && (
        <div style={{
          background: "var(--surface)",
          border: "0.5px solid var(--border)",
          borderRadius: 14,
          padding: 12,
          marginTop: -14,
        }}>
          {/* Interaction target: touch/pointer scrubbing along the payoff curve */}
          <div
            style={{ touchAction: "none" }}
            onMouseMove={(e) => handleScrub(e.clientX, e.currentTarget.getBoundingClientRect())}
            onMouseLeave={() => setScrubIdx(null)}
            onTouchStart={(e) => handleScrub(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
            onTouchMove={(e) => handleScrub(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
            onTouchEnd={() => setScrubIdx(null)}
          >
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
              {scrubX !== null && scrubY !== null && (
                <>
                  <line x1={scrubX} y1={0} x2={scrubX} y2={H} stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
                  <circle cx={scrubX} cy={scrubY} r={3.5} fill={strokeColor} />
                </>
              )}
            </svg>
          </div>
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
            {scrubI !== null ? (
              <>
                {/* Readout: projected balance + date at the scrubbed point */}
                <span style={{ color: "var(--text)", fontWeight: 500 }}>
                  {formatMoney(curve[scrubI].balance, asset.currency || "USD", displayCurrency)}
                </span>
                <span>
                  {curve[scrubI].date.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                </span>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

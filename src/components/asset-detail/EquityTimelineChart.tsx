"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useDisplayCurrency } from "@/lib/hooks";
import { useIsDesktop } from "@/lib/hooks/useIsDesktop";
import { useChartHaptic } from "@/hooks/useChartHaptic";
import { formatMoney } from "@/lib/money";
import {
  computeCurrentBalance,
  projectMortgage,
  annuityPayment,
  monthsBetween,
} from "@/lib/mortgage";
import type { RealEstateAsset } from "@/lib/supabase";

// ── Local pure helpers (intentionally not imported from snapshot.ts) ──────────

function fractionalYear(date: Date): number {
  const y = date.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  return y + (date.getTime() - start) / (end - start);
}

type XY = { x: number; y: number };

function monotoneCubicFn(pts: XY[]): (x: number) => number {
  const n = pts.length;
  if (n === 0) return () => 0;
  if (n === 1) return () => pts[0].y;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = new Array<number>(n);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) { const tau = 3 / Math.sqrt(s); m[i] = tau * a * d[i]; m[i + 1] = tau * b * d[i]; }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0] + m[0] * (x - xs[0]);
    if (x >= xs[n - 1]) return ys[n - 1] + m[n - 1] * (x - xs[n - 1]);
    let i = 0; while (i < n - 1 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i]
      + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const W = 320;
const H = 180;
const PAD_L = 6;
const PAD_R = 48;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;
const DRAW_W = W - PAD_L - PAD_R;
const DRAW_H = H - PAD_TOP - PAD_BOTTOM;
const SAMPLES = 120; // monthly samples across the window

interface EstimateResponse {
  available: boolean;
  series?: { year: number; value: number }[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EquityTimelineChart({ asset }: { asset: RealEstateAsset }) {
  const displayCurrency = useDisplayCurrency();
  const isDesktop = useIsDesktop();
  const haptic = useChartHaptic();
  const [estimateData, setEstimateData] = useState<EstimateResponse | null>(null);
  const [mode, setMode] = useState<"held" | "project">("held");
  const [scrub, setScrub] = useState<number | null>(null); // fractional year
  const prevMonthRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Guard: needs buy_date and buy_price to draw anything
  const buyDate = asset.buy_date ? new Date(asset.buy_date + (asset.buy_date.length === 7 ? "-15" : asset.buy_date.length === 4 ? "-07-01" : "")) : null;
  const buyPrice = typeof asset.buy_price === "number" && asset.buy_price > 0 ? asset.buy_price : null;
  if (!buyDate || !buyPrice) return null;

  const currency = asset.currency || "EUR";
  const money = (v: number) => formatMoney(Math.round(v), currency, displayCurrency);
  const today = new Date();
  const todayFy = fractionalYear(today);
  const buyFy = fractionalYear(buyDate);

  // Fetch CBS estimate series (NL only; non-NL falls back to straight line)
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/property-estimate?assetId=${encodeURIComponent(asset.id)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: EstimateResponse | null) => {
        if (d?.available && Array.isArray(d.series) && d.series.length >= 2) setEstimateData(d);
        else setEstimateData({ available: false });
      })
      .catch(() => setEstimateData({ available: false }));
    return () => ctrl.abort();
  }, [asset.id]);

  // Build mortgage schedule
  const todayDate = new Date();
  const currentBalance = computeCurrentBalance(asset, todayDate);
  const hasMortgage = currentBalance > 0;
  const mortgageType = (asset.mortgage_type ?? "annuity") as "annuity" | "linear" | "interest_only";
  const mortgageRate = asset.mortgage_rate ?? 0;
  const startStr = asset.mortgage_start_date ?? asset.buy_date ?? null;
  const endStr = asset.mortgage_end_date ?? null;
  const mortgageStart = startStr ? new Date(startStr) : null;
  const mortgageEnd = endStr ? new Date(endStr) : undefined;

  let pmt = asset.monthly_payment ?? null;
  if (pmt == null && mortgageType !== "interest_only" && mortgageEnd && hasMortgage) {
    const rem = monthsBetween(todayDate, mortgageEnd);
    if (rem > 0) pmt = annuityPayment(currentBalance, mortgageRate, rem);
  }

  const proj = hasMortgage && mortgageStart && mortgageRate != null && (pmt != null || mortgageType === "interest_only")
    ? projectMortgage(currentBalance, mortgageRate, pmt ?? 0, mortgageType, mortgageStart, todayDate, mortgageEnd)
    : null;

  const payoffDate = proj?.status === "ok" ? proj.payoffDate : null;
  const payoffFy = payoffDate ? fractionalYear(payoffDate) : null;
  const balanceCurve = proj?.status === "ok" ? proj.balanceCurve : [];
  const mortgageStartFy = mortgageStart ? fractionalYear(mortgageStart) : buyFy;

  // debtAt: linear interpolation over monthly curve
  const debtAt = useCallback((fy: number): number => {
    if (!hasMortgage || balanceCurve.length === 0) return 0;
    const k = (fy - mortgageStartFy) * 12;
    if (k <= 0) return balanceCurve[0]?.balance ?? 0;
    const i = Math.floor(k);
    if (i >= balanceCurve.length - 1) return balanceCurve[balanceCurve.length - 1]?.balance ?? 0;
    const frac = k - i;
    return balanceCurve[i].balance + frac * (balanceCurve[i + 1].balance - balanceCurve[i].balance);
  }, [hasMortgage, balanceCurve, mortgageStartFy]);

  // valueAt: CBS-shaped (or straight-line fallback), anchored at buy_price → asset.value
  const valueAt = useCallback((fy: number): number => {
    if (fy >= todayFy) return asset.value; // flat past today
    const series = estimateData?.series;
    if (series && series.length >= 2) {
      // Remap: CBS shape anchored at buy_price → asset.value (same as EstimatedValueChart)
      const cbsStart = series[0].value;
      const cbsEnd = series[series.length - 1].value;
      const cbsRange = cbsEnd - cbsStart;
      const targetEnd = asset.value;
      // Build control points at year+0.5 plus today anchor
      const cps: XY[] = series.map((p) => {
        const t = Math.abs(cbsRange) > 1e-6 ? (p.value - cbsStart) / cbsRange : 0;
        return { x: p.year + 0.5, y: cbsStart + t * (targetEnd - cbsStart) };
      });
      // Ensure today anchor
      const todayAnchor = { x: todayFy, y: asset.value };
      if (cps[cps.length - 1].x < todayFy - 0.01) cps.push(todayAnchor);
      const S = monotoneCubicFn(cps);
      return Math.max(0, S(fy));
    }
    // Straight-line fallback
    if (todayFy <= buyFy) return asset.value;
    const t = (fy - buyFy) / (todayFy - buyFy);
    return buyPrice + t * (asset.value - buyPrice);
  }, [estimateData, asset.value, buyFy, buyPrice, todayFy]);

  // Window: Held = buy → today; Project = buy → payoff
  const windowEnd = mode === "project" && payoffFy ? payoffFy : todayFy;
  const showToggle = hasMortgage && payoffFy != null;
  const payoffYear = payoffDate?.getFullYear();

  // Sample SAMPLES points across [buyFy, windowEnd]
  const span = Math.max(windowEnd - buyFy, 0.1);
  const samples: { fy: number; value: number; debt: number; equity: number }[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const fy = buyFy + (i / SAMPLES) * span;
    const v = fy >= todayFy ? asset.value : valueAt(fy);
    const debt = Math.max(0, debtAt(fy));
    const equity = Math.max(0, v - Math.min(debt, v));
    samples.push({ fy, value: v, debt, equity });
  }

  // Y domain: 0 → max value (always positive)
  const maxVal = Math.max(...samples.map((s) => s.value), buyPrice, asset.value);
  const yHi = maxVal * 1.06;
  const yLo = 0;

  const toX = (fy: number) => PAD_L + ((fy - buyFy) / span) * DRAW_W;
  const toY = (v: number) => PAD_TOP + DRAW_H - ((v - yLo) / (yHi - yLo)) * DRAW_H;

  const todayX = toX(todayFy);
  const buyX = toX(buyFy);
  const buyY = toY(buyPrice);

  // Build SVG paths
  const pts = samples.map((s) => ({ x: toX(s.fy), y: toY(s.value) }));
  const eqPts = samples.map((s) => ({ x: toX(s.fy), y: toY(s.equity) }));
  const baseline = toY(0);

  const polyLine = (arr: XY[]) => arr.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  // Value line (split past/future opacity handled by stroke-opacity)
  const pastValuePts = samples.filter((s) => s.fy <= todayFy).map((s) => ({ x: toX(s.fy), y: toY(s.value) }));
  const futureValuePts = samples.filter((s) => s.fy >= todayFy).map((s) => ({ x: toX(s.fy), y: toY(s.value) }));

  // Equity area
  const eqArea = `${polyLine(eqPts)} L ${eqPts[eqPts.length - 1].x.toFixed(1)} ${baseline.toFixed(1)} L ${eqPts[0].x.toFixed(1)} ${baseline.toFixed(1)} Z`;

  // Mortgage band (between equity edge and value line)
  const mortgageBand = hasMortgage
    ? `${polyLine(eqPts)} L ${pts[pts.length - 1].x.toFixed(1)} ${pts[pts.length - 1].y.toFixed(1)} ` +
      pts.slice().reverse().map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z"
    : "";

  // Gridlines (2 lines at 25% and 75% of yHi)
  const gridVals = [Math.round(yHi * 0.33 / 1000) * 1000, Math.round(yHi * 0.66 / 1000) * 1000].filter((v) => v > 0 && v < yHi);

  // Payoff dot
  const payoffDot = mode === "project" && payoffFy
    ? { x: toX(payoffFy), y: toY(valueAt(Math.min(payoffFy, todayFy))) }
    : null;

  // Scrub readout
  const scrubFy = scrub ?? todayFy;
  const scrubSample = (() => {
    const v = scrubFy >= todayFy ? asset.value : valueAt(scrubFy);
    const debt = Math.max(0, debtAt(scrubFy));
    const equity = Math.max(0, v - Math.min(debt, v));
    return { value: v, debt, equity };
  })();
  const scrubX = toX(scrubFy);
  const scrubEqY = toY(scrubSample.equity);
  const isFuture = scrubFy > todayFy;

  // Date label
  const scrubDate = (() => {
    const fractPart = scrubFy - Math.floor(scrubFy);
    const year = Math.floor(scrubFy);
    const month = Math.round(fractPart * 12);
    const d = new Date(year, month, 1);
    return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  })();

  const pctOwned = scrubSample.value > 0 ? Math.round((scrubSample.equity / scrubSample.value) * 100) : 0;

  // Pointer/touch handlers
  const handlePointer = useCallback((clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = (clientX - rect.left) / rect.width;
    const fy = buyFy + relX * (W / rect.width) * (span / (W / DRAW_W));
    // More accurate: map pixel fraction to DRAW_W fraction accounting for padding
    const pxX = relX * rect.width;
    const drawFrac = Math.max(0, Math.min(1, (pxX / rect.width * W - PAD_L) / DRAW_W));
    const newFy = Math.max(buyFy, Math.min(windowEnd, buyFy + drawFrac * span));
    const newMonth = Math.floor(newFy * 12);
    if (prevMonthRef.current !== newMonth) { haptic(newMonth); prevMonthRef.current = newMonth; }
    setScrub(newFy);
    void fy; // suppress unused warning
  }, [buyFy, windowEnd, span, haptic]);

  const clearScrub = useCallback(() => {
    setScrub(null);
    prevMonthRef.current = null;
    haptic(null);
  }, [haptic]);

  // Scrub box position
  const scrubBoxLeft = isDesktop
    ? Math.min(Math.max(scrubX / W * 100, 0), 70) + "%"
    : "0";

  // Only render once we have data (avoid flash)
  if (estimateData === null) return null;

  const gradId = `eq_${asset.id}`;
  const mortGradId = `mort_${asset.id}`;

  return (
    <div style={{ marginBottom: 18 }}>
      {/* Toggle */}
      {showToggle && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {(["held", "project"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setScrub(null); }}
              style={{
                fontSize: 12, fontWeight: 500, padding: "4px 12px", borderRadius: 999,
                border: "0.5px solid var(--border)",
                background: mode === m ? "var(--accent)" : "var(--surface)",
                color: mode === m ? "#fff" : "var(--text-dim)",
                cursor: "pointer",
              }}
            >
              {m === "held" ? "Held" : `To ${payoffYear}`}
            </button>
          ))}
        </div>
      )}

      <div
        style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 14, padding: "14px 14px 10px", position: "relative", userSelect: "none" }}
      >
        {/* Scrub readout box */}
        {scrub !== null && (
          <div style={{
            position: "absolute",
            top: 10, left: isDesktop ? scrubBoxLeft : 14,
            background: "var(--surface)", border: "0.5px solid var(--border)",
            borderRadius: 10, padding: "7px 10px", zIndex: 10,
            fontSize: 12, lineHeight: 1.5, minWidth: 148,
            pointerEvents: "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}>
            <div style={{ fontWeight: 600, color: "var(--text-dim)", marginBottom: 2, fontSize: 11 }}>
              {scrubDate}{isFuture ? " · projected" : ""}
            </div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 15, fontWeight: 600, color: "var(--accent)", fontFeatureSettings: '"tnum" 1', letterSpacing: "-0.01em" }}>
              {money(scrubSample.equity)}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", fontFeatureSettings: '"tnum" 1' }}>
              Value {money(scrubSample.value)}
            </div>
            {hasMortgage && (
              <div style={{ fontSize: 11, color: "var(--text-dim)", fontFeatureSettings: '"tnum" 1' }}>
                Mortgage {money(scrubSample.debt)}
              </div>
            )}
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
              {pctOwned}% owned
            </div>
          </div>
        )}

        {/* SVG chart */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          width="100%"
          height={H}
          style={{ display: "block", touchAction: "none" }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); handlePointer(e.clientX); }}
          onPointerMove={(e) => { if (e.buttons > 0) handlePointer(e.clientX); }}
          onPointerUp={clearScrub}
          onPointerLeave={clearScrub}
        >
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.7} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.25} />
            </linearGradient>
            <linearGradient id={mortGradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--text-faint)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--text-faint)" stopOpacity={0.12} />
            </linearGradient>
          </defs>

          {/* Gridlines */}
          {gridVals.map((v) => (
            <g key={v}>
              <line x1={PAD_L} y1={toY(v)} x2={W - PAD_R + 4} y2={toY(v)} stroke="var(--border)" strokeWidth={0.5} />
              <text x={W - PAD_R + 6} y={toY(v) + 3.5} fontSize={9} fill="var(--text-faint)" fontFamily="var(--font-sans)">
                {v >= 1000 ? `${Math.round(v / 1000)}k` : v}
              </text>
            </g>
          ))}

          {/* Mortgage band */}
          {hasMortgage && <path d={mortgageBand} fill={`url(#${mortGradId})`} opacity={mode === "project" && scrubFy > todayFy ? 0.55 : 1} />}

          {/* Equity area */}
          <path d={eqArea} fill={`url(#${gradId})`} />

          {/* Value line — solid up to today, dashed past */}
          {pastValuePts.length >= 2 && (
            <path d={polyLine(pastValuePts)} fill="none" stroke="var(--hero)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          )}
          {mode === "project" && futureValuePts.length >= 2 && (
            <path d={polyLine(futureValuePts)} fill="none" stroke="var(--hero)" strokeWidth={1.4} strokeDasharray="4 3" opacity={0.45} strokeLinecap="round" />
          )}

          {/* TODAY line */}
          {todayX >= PAD_L && todayX <= PAD_L + DRAW_W && (
            <g>
              <line x1={todayX} y1={PAD_TOP} x2={todayX} y2={H - PAD_BOTTOM} stroke="var(--text-faint)" strokeWidth={0.8} strokeDasharray="3 3" />
              <rect x={todayX - 16} y={H - PAD_BOTTOM + 2} width={32} height={11} rx={3} fill="var(--surface-raised, var(--surface))" />
              <text x={todayX} y={H - PAD_BOTTOM + 10} textAnchor="middle" fontSize={7.5} fontWeight={600} fill="var(--text-faint)" fontFamily="var(--font-sans)" letterSpacing="0.06em">
                TODAY
              </text>
            </g>
          )}

          {/* Purchase marker */}
          <circle cx={buyX} cy={buyY} r={4} fill="var(--surface)" stroke="var(--hero)" strokeWidth={1.6} />

          {/* Payoff dot */}
          {payoffDot && (
            <circle cx={payoffDot.x} cy={payoffDot.y} r={4} fill="var(--accent)" />
          )}

          {/* Scrub line + dot */}
          {scrub !== null && (
            <g>
              <line x1={scrubX} y1={PAD_TOP} x2={scrubX} y2={H - PAD_BOTTOM} stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
              <circle cx={scrubX} cy={scrubEqY} r={3.5} fill="var(--accent)" />
            </g>
          )}
        </svg>

        {/* X axis labels */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, paddingLeft: PAD_L, paddingRight: PAD_R, fontSize: 10, color: "var(--text-faint)", fontFeatureSettings: '"tnum" 1' }}>
          <span>{buyDate.getFullYear()}</span>
          <span>{mode === "project" && payoffYear ? payoffYear : new Date().getFullYear()}</span>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 10, paddingLeft: 2 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-dim)" }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--accent)", opacity: 0.8 }} />
            Equity
          </span>
          {hasMortgage && (
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-dim)" }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--text-faint)", opacity: 0.4 }} />
              Mortgage
            </span>
          )}
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-dim)" }}>
            <span style={{ width: 14, height: 2, background: "var(--hero)", borderRadius: 1 }} />
            Value
          </span>
        </div>
      </div>
    </div>
  );
}

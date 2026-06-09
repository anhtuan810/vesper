"use client";

import { useEffect, useState } from "react";
import { useDisplayCurrency } from "@/lib/hooks";
import { useChartHaptic } from "@/hooks/useChartHaptic";
import { formatMoney } from "@/lib/money";
import type { RealEstateAsset } from "@/lib/supabase";

// Per-year indicative property value chart. Sourced ENTIRELY from the prompt-1
// estimate engine via GET /api/property-estimate — the component does no
// computation beyond reading the series and laying it out (display math). NL only;
// self-hides when unavailable, the series is too short, or the fetch fails.

interface EstimateResponse {
  available: boolean;
  currentEstimate?: number;
  series?: { year: number; value: number }[];
  regionName?: string;
  regionCode?: string;
  asOfPeriod?: string;
  clamped?: boolean;
}

function isNL(country: string | null | undefined): boolean {
  const c = (country || "").trim().toUpperCase();
  return c === "NL" || c === "NLD" || c === "NETHERLANDS" || c === "THE NETHERLANDS";
}

const W = 320;
const H = 120;
const PAD_X = 6;
const PAD_TOP = 12;
const PAD_BOTTOM = 14;
// Mark the stated current value separately only when it diverges from the latest
// indicative point by more than this — the gap is the signal, not noise.
const DIVERGENCE = 0.05;

// Fritsch-Carlson monotone cubic path through SVG-coordinate points.
// Returns an SVG path string starting with M, using C commands between points.
function smoothLinePath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) {
    return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  }
  const n = pts.length;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m: number[] = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * d[i];
      m[i + 1] = tau * b * d[i];
    }
  }
  let path = `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = (xs[i + 1] - xs[i]) / 3;
    const cp1x = xs[i] + dx, cp1y = ys[i] + dx * m[i];
    const cp2x = xs[i + 1] - dx, cp2y = ys[i + 1] - dx * m[i + 1];
    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${xs[i + 1].toFixed(1)} ${ys[i + 1].toFixed(1)}`;
  }
  return path;
}

export function EstimatedValueChart({ asset }: { asset: RealEstateAsset }) {
  const displayCurrency = useDisplayCurrency();
  const [data, setData] = useState<EstimateResponse | null>(null);
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);
  const haptic = useChartHaptic();

  const eligible = isNL(asset.country) && !!asset.address;

  useEffect(() => {
    if (!eligible) return;
    const ctrl = new AbortController();
    fetch(`/api/property-estimate?assetId=${encodeURIComponent(asset.id)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: EstimateResponse | null) => {
        if (d?.available && Array.isArray(d.series) && d.series.length >= 2) setData(d);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [eligible, asset.id]);

  if (!eligible || !data?.series || data.series.length < 2) return null;

  const series = data.series;
  const cur = asset.currency || "EUR";
  const money = (n: number) => formatMoney(n, cur, displayCurrency);

  const purchase = series[0];
  const latest = series[series.length - 1];
  const region = data.regionName ?? data.regionCode ?? "regional";

  // Stated current value, marked separately when it diverges from the indicative
  // line. Not reconciled — the divergence is intentional signal.
  const statedValue = typeof asset.value === "number" && asset.value > 0 ? asset.value : null;
  const currentYear = new Date().getFullYear();
  const markStated =
    statedValue != null &&
    latest.value > 0 &&
    Math.abs(statedValue - latest.value) / latest.value > DIVERGENCE;

  // Domains — include the stated marker so it stays on-canvas.
  const xMin = purchase.year;
  const xMax = markStated ? Math.max(latest.year, currentYear) : latest.year;
  const yVals = [...series.map((p) => p.value), ...(markStated ? [statedValue as number] : [])];
  const vMin = Math.min(...yVals);
  const vMax = Math.max(...yVals);
  const vPad = Math.max((vMax - vMin) * 0.08, 1);
  const yLo = vMin - vPad;
  const yHi = vMax + vPad;

  const toX = (year: number) => PAD_X + ((year - xMin) / (xMax - xMin || 1)) * (W - 2 * PAD_X);
  const toY = (v: number) => H - PAD_BOTTOM - ((v - yLo) / (yHi - yLo || 1)) * (H - PAD_TOP - PAD_BOTTOM);

  const pts = series.map((p) => ({ x: toX(p.year), y: toY(p.value) }));
  const line = smoothLinePath(pts);
  const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${H - PAD_BOTTOM} L ${pts[0].x.toFixed(1)} ${H - PAD_BOTTOM} Z`;

  const stroke = "var(--accent)";
  const gradId = `est_${asset.id}`;

  const statedX = markStated ? toX(currentYear) : null;
  const statedY = markStated && statedValue != null ? toY(statedValue) : null;

  // Scrub — snap to the nearest year point (matches the amortization-curve scrub).
  const scrub = scrubIdx != null ? series[Math.min(scrubIdx, series.length - 1)] : null;
  const scrubX = scrub ? toX(scrub.year) : null;
  const scrubY = scrub ? toY(scrub.value) : null;
  const handleScrub = (clientX: number, rect: DOMRect) => {
    if (rect.width <= 0) return;
    const relX = (clientX - rect.left) / rect.width;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < series.length; i++) {
      const frac = (series[i].year - xMin) / (xMax - xMin || 1);
      const d = Math.abs(frac - relX);
      if (d < bestD) { bestD = d; best = i; }
    }
    setScrubIdx(best);
    haptic(best);
  };

  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{
        fontSize: 10, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase",
        color: "var(--text-faint)", marginBottom: 6,
      }}>
        Indicative value
      </div>

      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 14, padding: 16 }}>
        {/* Header: latest indicative value (or the scrubbed point) */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, gap: 12 }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 500, color: "var(--hero)", letterSpacing: "-0.01em", fontFeatureSettings: '"tnum" 1' }}>
            {money(scrub ? scrub.value : latest.value)}
            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-faint)", marginLeft: 6, fontFamily: "var(--font-sans)" }}>
              {scrub ? scrub.year : latest.year}
            </span>
          </div>
          {markStated && statedValue != null && !scrub && (
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-dim)", fontFeatureSettings: '"tnum" 1' }}>
              stated {money(statedValue)}
            </div>
          )}
        </div>

        {/* Interaction target: touch/pointer scrubbing along the per-year series */}
        <div
          style={{ touchAction: "none" }}
          onMouseMove={(e) => handleScrub(e.clientX, e.currentTarget.getBoundingClientRect())}
          onMouseLeave={() => { setScrubIdx(null); haptic(null); }}
          onTouchStart={(e) => handleScrub(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
          onTouchMove={(e) => handleScrub(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
          onTouchEnd={() => { setScrubIdx(null); haptic(null); }}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: "block" }}>
            <defs>
              <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.16} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gradId})`} />
            <path d={line} fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />

            {/* Derived points */}
            {pts.slice(1).map((p, i) => (
              <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={2} fill={stroke} />
            ))}
            {/* Purchase point — the real anchor, marked distinctly (hollow ring) */}
            <circle cx={pts[0].x.toFixed(1)} cy={pts[0].y.toFixed(1)} r={4} fill="var(--surface)" stroke={stroke} strokeWidth={1.8} />

            {/* Stated current value, when it diverges — a separate point */}
            {statedX != null && statedY != null && (
              <>
                <line x1={statedX} y1={0} x2={statedX} y2={H} stroke="var(--text)" strokeWidth={0.5} strokeDasharray="3 3" opacity={0.25} />
                <rect x={(statedX - 3).toFixed(1)} y={(statedY - 3).toFixed(1)} width={6} height={6} fill="var(--hero)" />
              </>
            )}

            {/* Scrub marker */}
            {scrubX != null && scrubY != null && (
              <>
                <line x1={scrubX} y1={0} x2={scrubX} y2={H} stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
                <circle cx={scrubX} cy={scrubY} r={3.5} fill={stroke} />
              </>
            )}
          </svg>
        </div>

        {/* X axis: purchase year … latest */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "var(--text-faint)", fontFeatureSettings: '"tnum" 1' }}>
          <span>{xMin}</span>
          <span>{xMax}</span>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 12 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-dim)" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", border: `1.8px solid ${stroke}`, background: "var(--surface)" }} />
            Purchase {money(purchase.value)}
          </span>
          {markStated && statedValue != null && (
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-dim)" }}>
              <span style={{ width: 8, height: 8, background: "var(--hero)" }} />
              Stated {money(statedValue)}
            </span>
          )}
        </div>

        {/* Honest label: indicative, region, reference period, baseline note. */}
        <div style={{ fontSize: 11, color: "var(--text-faint)", lineHeight: 1.5, marginTop: 12 }}>
          Indicative value, based on {region} price trends since purchase — not an appraisal.
          {data.asOfPeriod ? ` Index as of ${data.asOfPeriod}.` : ""}
          {data.clamped ? " Series starts at the 1995 index baseline." : ""}
        </div>
      </div>
    </div>
  );
}

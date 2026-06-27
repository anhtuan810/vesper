"use client";

import { useEffect, useState } from "react";
import { useDisplayCurrency } from "@/lib/hooks";
import { useChartHaptic } from "@/hooks/useChartHaptic";
import { formatMoney } from "@/lib/money";
import type { RealEstateAsset } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";

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
    apiFetch(`/api/property-estimate?assetId=${encodeURIComponent(asset.id)}`, { signal: ctrl.signal })
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
  const region = data.regionName ?? data.regionCode ?? "regional";

  // Remap CBS series to be anchored at buy_price → asset.value (stated current),
  // identical to the realEstateT logic in snapshot.ts. CBS drives shape only;
  // the endpoints are hard-anchored so this chart is consistent with the
  // portfolio net-worth reconstruction.
  const cbsStart = series[0].value;
  const cbsEnd = series[series.length - 1].value;
  const targetEnd = typeof asset.value === "number" && asset.value > 0 ? asset.value : cbsEnd;
  const cbsRange = cbsEnd - cbsStart;
  const anchoredSeries = series.map((p, i) => {
    const t = Math.abs(cbsRange) > 1e-6
      ? (p.value - cbsStart) / cbsRange
      : series.length > 1 ? i / (series.length - 1) : 1;
    return { year: p.year, value: cbsStart + t * (targetEnd - cbsStart) };
  });

  const purchase = anchoredSeries[0];
  const latest = anchoredSeries[anchoredSeries.length - 1];
  const xMin = purchase.year;
  const xMax = latest.year;
  const yVals = anchoredSeries.map((p) => p.value);
  const vMin = Math.min(...yVals);
  const vMax = Math.max(...yVals);
  const vPad = Math.max((vMax - vMin) * 0.08, 1);
  const yLo = vMin - vPad;
  const yHi = vMax + vPad;

  const toX = (year: number) => PAD_X + ((year - xMin) / (xMax - xMin || 1)) * (W - 2 * PAD_X);
  const toY = (v: number) => H - PAD_BOTTOM - ((v - yLo) / (yHi - yLo || 1)) * (H - PAD_TOP - PAD_BOTTOM);

  const pts = anchoredSeries.map((p) => ({ x: toX(p.year), y: toY(p.value) }));
  const line = smoothLinePath(pts);
  const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${H - PAD_BOTTOM} L ${pts[0].x.toFixed(1)} ${H - PAD_BOTTOM} Z`;

  const stroke = "var(--accent)";
  const gradId = `est_${asset.id}`;

  const scrub = scrubIdx != null ? anchoredSeries[Math.min(scrubIdx, anchoredSeries.length - 1)] : null;
  const scrubX = scrub ? toX(scrub.year) : null;
  const scrubY = scrub ? toY(scrub.value) : null;
  const handleScrub = (clientX: number, rect: DOMRect) => {
    if (rect.width <= 0) return;
    const relX = (clientX - rect.left) / rect.width;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < anchoredSeries.length; i++) {
      const frac = (anchoredSeries[i].year - xMin) / (xMax - xMin || 1);
      const d = Math.abs(frac - relX);
      if (d < bestD) { bestD = d; best = i; }
    }
    setScrubIdx(best);
    haptic(best);
  };

  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 500, fontFamily: "var(--mono)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase",
        color: "var(--text-faint)", marginBottom: 6,
      }}>
        Indicative value
      </div>

      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 14, padding: 16 }}>
        {/* Header: latest indicative value (or the scrubbed point) */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, gap: 12 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 500, color: "var(--hero)", letterSpacing: "-0.01em", fontFeatureSettings: '"tnum" 1' }}>
            {money(scrub ? scrub.value : latest.value)}
            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-faint)", marginLeft: 6, fontFamily: "var(--font-sans)" }}>
              {scrub ? scrub.year : latest.year}
            </span>
          </div>
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

            {/* Intermediate year dots */}
            {pts.slice(1).map((p, i) => (
              <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={2} fill={stroke} />
            ))}
            {/* Purchase point — hollow ring anchor */}
            <circle cx={pts[0].x.toFixed(1)} cy={pts[0].y.toFixed(1)} r={4} fill="var(--surface)" stroke={stroke} strokeWidth={1.8} />

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
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "var(--text-faint)", fontFamily: "var(--mono)", fontFeatureSettings: '"tnum" 1' }}>
          <span>{xMin}</span>
          <span>{xMax}</span>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 12 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-dim)" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", border: `1.8px solid ${stroke}`, background: "var(--surface)" }} />
            Purchase {money(purchase.value)}
          </span>
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

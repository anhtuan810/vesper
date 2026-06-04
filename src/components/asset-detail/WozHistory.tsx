"use client";

import { useEffect, useState } from "react";
import { useDisplayCurrency } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";
import type { RealEstateAsset } from "@/lib/supabase";
import type { WozEntry, WozResult } from "@/lib/woz";

// WOZ valuation-history section (NL only). Fetches the deterministic, server-cached
// WOZ series via /api/woz and renders it as an inline-SVG stepped chart with the
// purchase price and current market value as reference markers, plus a CAGR. The
// section hides itself entirely when WOZ is unavailable or empty — no error UI.

function isNL(country: string | null | undefined): boolean {
  const c = (country || "").trim().toUpperCase();
  return c === "NL" || c === "NLD" || c === "NETHERLANDS" || c === "THE NETHERLANDS";
}

const W = 320;
const H = 112;
const PAD_X = 6;
const PAD_TOP = 10;
const PAD_BOTTOM = 12;

export function WozHistory({ asset }: { asset: RealEstateAsset }) {
  const displayCurrency = useDisplayCurrency();
  const [history, setHistory] = useState<WozEntry[] | null>(null);

  const eligible = isNL(asset.country) && !!asset.address;

  useEffect(() => {
    if (!eligible) return;
    const ctrl = new AbortController();
    fetch(`/api/woz?assetId=${encodeURIComponent(asset.id)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: WozResult | null) => {
        if (d?.available && Array.isArray(d.history) && d.history.length > 0) {
          setHistory(d.history);
        }
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [eligible, asset.id]);

  if (!eligible || !history) return null;

  // Show the series since purchase; fall back to the full series if that leaves
  // too little to chart.
  const buyYear = asset.buy_date ? new Date(asset.buy_date).getFullYear() : null;
  const sincePurchase = buyYear ? history.filter((e) => e.year >= buyYear) : history;
  const series = sincePurchase.length >= 2 ? sincePurchase : history;
  if (series.length < 2) return null;

  const cur = asset.currency || "EUR";
  const money = (n: number) => formatMoney(n, cur, displayCurrency);

  const first = series[0];
  const last = series[series.length - 1];
  const currentYear = new Date().getFullYear();
  const buyPrice = typeof asset.buy_price === "number" && asset.buy_price > 0 ? asset.buy_price : null;
  const currentValue = asset.value;

  // Deterministic CAGR over the WOZ series.
  const cagr =
    last.year > first.year && first.value > 0
      ? Math.pow(last.value / first.value, 1 / (last.year - first.year)) - 1
      : null;

  // Domains — include the reference markers so they stay on-canvas.
  const xMin = Math.min(first.year, buyYear ?? first.year);
  const xMax = Math.max(last.year, currentYear);
  const refValues = [
    ...series.map((e) => e.value),
    ...(buyPrice != null ? [buyPrice] : []),
    currentValue,
  ];
  const vMin = Math.min(...refValues);
  const vMax = Math.max(...refValues);
  const vPad = Math.max((vMax - vMin) * 0.08, 1);
  const yLo = vMin - vPad;
  const yHi = vMax + vPad;

  const toX = (year: number) => PAD_X + ((year - xMin) / (xMax - xMin || 1)) * (W - 2 * PAD_X);
  const toY = (v: number) => (H - PAD_BOTTOM) - ((v - yLo) / (yHi - yLo || 1)) * (H - PAD_TOP - PAD_BOTTOM);

  // Stepped WOZ path: each official value holds across its year; the final value
  // holds out to the current year.
  const pts = series.map((e) => ({ x: toX(e.year), y: toY(e.value) }));
  let line = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    line += ` L ${pts[i].x.toFixed(1)} ${pts[i - 1].y.toFixed(1)} L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
  }
  const endX = toX(xMax);
  line += ` L ${endX.toFixed(1)} ${pts[pts.length - 1].y.toFixed(1)}`;
  const area = `${line} L ${endX.toFixed(1)} ${H - PAD_BOTTOM} L ${pts[0].x.toFixed(1)} ${H - PAD_BOTTOM} Z`;

  const currentY = toY(currentValue);
  const buyX = buyYear != null ? toX(buyYear) : null;
  const buyY = buyPrice != null ? toY(buyPrice) : null;
  const gradId = `woz_${asset.id}`;
  const stroke = "var(--category-property)";

  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{
        fontSize: 10, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase",
        color: "var(--text-faint)", marginBottom: 12,
      }}>
        Valuation history · WOZ
      </div>

      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 14, padding: 16 }}>
        {/* Header: CAGR + latest official value */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, gap: 12 }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 500, color: "var(--hero)", letterSpacing: "-0.01em", fontFeatureSettings: '"tnum" 1' }}>
            {money(last.value)}
            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-faint)", marginLeft: 6, fontFamily: "var(--font-sans)" }}>
              {last.year} WOZ
            </span>
          </div>
          {cagr != null && (
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-dim)", fontFeatureSettings: '"tnum" 1' }}>
              {cagr >= 0 ? "+" : "−"}{Math.abs(cagr * 100).toFixed(1)}%/yr · {first.year}–{last.year}
            </div>
          )}
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: "block" }}>
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.16} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Current market value — dashed reference line */}
          <line x1={0} y1={currentY.toFixed(1)} x2={W} y2={currentY.toFixed(1)} stroke="var(--text)" strokeWidth={0.5} strokeDasharray="3 3" opacity={0.3} />

          {/* WOZ stepped series */}
          <path d={area} fill={`url(#${gradId})`} />
          <path d={line} fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          {pts.map((p, i) => (
            <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={2} fill={stroke} />
          ))}

          {/* Purchase-price marker */}
          {buyX != null && buyY != null && (
            <circle cx={buyX.toFixed(1)} cy={buyY.toFixed(1)} r={3.5} fill="none" stroke="var(--text-dim)" strokeWidth={1.5} />
          )}
        </svg>

        {/* X axis: first WOZ year … current year */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "var(--text-faint)", fontFeatureSettings: '"tnum" 1' }}>
          <span>{xMin}</span>
          <span>{xMax}</span>
        </div>

        {/* Reference legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 12 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-dim)" }}>
            <span style={{ width: 10, height: 2, background: stroke, borderRadius: 2 }} />
            WOZ value
          </span>
          {buyPrice != null && (
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-dim)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", border: "1.5px solid var(--text-dim)" }} />
              Paid {money(buyPrice)}
            </span>
          )}
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-dim)" }}>
            <span style={{ width: 10, height: 0, borderTop: "1px dashed var(--text)", opacity: 0.5 }} />
            Market {money(currentValue)}
          </span>
        </div>

        {/* Honest caveat: official valuation, reference-date lag, below market. */}
        <div style={{ fontSize: 11, color: "var(--text-faint)", lineHeight: 1.5, marginTop: 12 }}>
          Official municipal valuation (WOZ). Each year&apos;s value reflects 1 January of the prior year and typically sits below market value.
        </div>
      </div>
    </div>
  );
}

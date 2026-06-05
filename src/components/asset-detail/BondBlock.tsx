"use client";

import type { BondsAsset } from "@/lib/supabase";
import { useDisplayCurrency } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";

interface Props {
  asset: BondsAsset;
}

function parseLocalDate(str: string): Date {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function computeTimeToMaturity(maturityDateStr: string): string {
  const today = new Date();
  const maturity = parseLocalDate(maturityDateStr);
  if (maturity <= today) return "Matured";

  const totalMonths =
    (maturity.getFullYear() - today.getFullYear()) * 12 +
    (maturity.getMonth() - today.getMonth());

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  if (years === 0) return `${months} months`;
  if (months === 0) return `${years} years`;
  return `${years}yr ${months}mo`;
}

function formatMaturityDate(str: string): string {
  const [y, m] = str.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export function BondBlock({ asset }: Props) {
  const displayCurrency = useDisplayCurrency();
  const { issuer, coupon_rate, maturity_date, isin } = asset;
  const timeToMaturity = maturity_date ? computeTimeToMaturity(maturity_date) : null;
  const maturityDisplay = maturity_date ? formatMaturityDate(maturity_date) : "—";
  const annualCoupon = coupon_rate != null && asset.value > 0
    ? (coupon_rate / 100) * asset.value
    : null;

  const rows = [
    { label: "Issuer", value: issuer ?? "—", meta: null, isin: false },
    { label: "Coupon", value: coupon_rate != null ? `${parseFloat(coupon_rate.toFixed(2))}%` : "—", meta: annualCoupon != null ? `${formatMoney(annualCoupon, asset.currency || "USD", displayCurrency)} / year` : null, isin: false },
    { label: "Maturity", value: maturityDisplay, meta: timeToMaturity, isin: false },
    { label: "ISIN", value: isin ?? "—", meta: null, isin: true },
  ];

  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 12 }}>
        Bond details
      </div>
      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
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
              <span style={row.isin ? {
                fontFamily: "var(--font-sans)",
                fontSize: 13,
                color: "var(--text-dim)",
                letterSpacing: "0.02em",
              } : {
                fontFamily: "var(--font-serif)",
                fontSize: 16,
                fontWeight: 500,
                color: "var(--hero)",
                letterSpacing: "-0.005em",
                fontFeatureSettings: '"tnum" 1',
                fontVariationSettings: "'opsz' 18",
                lineHeight: 1.1,
              }}>
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
    </div>
  );
}

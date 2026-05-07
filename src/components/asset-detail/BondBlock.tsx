"use client";

import { currencySymbol, formatDate } from "@/lib/utils";
import type { BondsAsset } from "@/lib/supabase";

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

  if (years === 0) return `${months}mo`;
  if (months === 0) return `${years}yr`;
  return `${years}yr ${months}mo`;
}

export function BondBlock({ asset }: Props) {
  const { issuer, coupon_rate, maturity_date, isin, value, currency } = asset;
  const sym = currencySymbol(currency);
  const annualIncome = coupon_rate != null ? value * (coupon_rate / 100) : null;
  const timeToMaturity = maturity_date ? computeTimeToMaturity(maturity_date) : null;

  const primaryStats = [
    { label: "Issuer", value: issuer ?? "—", serif: true },
    { label: "Coupon", value: coupon_rate != null ? `${coupon_rate.toFixed(1)}%` : "—", mono: true },
    { label: "Maturity", value: maturity_date ? formatDate(maturity_date) : "—", mono: true },
    { label: "ISIN", value: isin ?? "—", mono: true, small: true },
  ];

  const computedStats = [
    { label: "Time to maturity", value: timeToMaturity ?? "—" },
    { label: "Annual income", value: annualIncome != null ? `${sym}${Math.round(annualIncome).toLocaleString("en")}` : "—" },
  ];

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        className="font-serif text-fg"
        style={{ fontSize: 18, fontWeight: 400, fontVariationSettings: "'opsz' 144", marginBottom: 14 }}
      >
        Bond details
      </div>

      {/* Primary stats — 2×2 grid */}
      <div className="grid grid-cols-2 gap-2">
        {primaryStats.map(({ label, value, serif, mono, small }) => (
          <div
            key={label}
            style={{
              padding: "12px 14px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
            }}
          >
            <div
              className="font-mono uppercase text-faint"
              style={{ fontSize: 9, letterSpacing: "0.16em", marginBottom: 8 }}
            >
              {label}
            </div>
            <div
              className={serif ? "font-serif" : "font-mono"}
              style={{
                fontSize: small ? 11 : serif ? 13 : 14,
                fontWeight: serif ? 400 : 500,
                color: "var(--text)",
                fontVariationSettings: serif ? "'opsz' 144" : undefined,
                wordBreak: mono ? "break-all" : undefined,
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Computed stats */}
      <div
        style={{
          marginTop: 8,
          padding: "14px 16px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "14px 18px",
        }}
      >
        {computedStats.map(({ label, value }) => (
          <div key={label}>
            <div
              className="font-mono uppercase text-faint"
              style={{ fontSize: 9, letterSpacing: "0.14em", marginBottom: 4 }}
            >
              {label}
            </div>
            <div
              className="font-mono"
              style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { formatDate } from "@/lib/utils";
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
  const { issuer, coupon_rate, maturity_date, isin } = asset;
  const timeToMaturity = maturity_date ? computeTimeToMaturity(maturity_date) : null;

  const CELL = { padding: "12px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 };
  const LABEL_STYLE = { fontSize: 9, letterSpacing: "0.16em" as const, marginBottom: 8 };

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        className="font-serif text-fg"
        style={{ fontSize: 18, fontWeight: 400, fontVariationSettings: "'opsz' 144", marginBottom: 14 }}
      >
        Bond details
      </div>

      {/* Primary stats — 2×2 grid, all read-only */}
      <div className="grid grid-cols-2 gap-2">

        <div style={CELL}>
          <div className="font-mono uppercase text-faint" style={LABEL_STYLE}>Issuer</div>
          <div className="font-serif" style={{ fontSize: 13, fontWeight: 400, color: "var(--text)", fontVariationSettings: "'opsz' 144" }}>
            {issuer ?? "—"}
          </div>
        </div>

        <div style={CELL}>
          <div className="font-mono uppercase text-faint" style={LABEL_STYLE}>Coupon</div>
          <div className="font-mono" style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
            {coupon_rate != null ? `${coupon_rate.toFixed(1)}%` : "—"}
          </div>
        </div>

        <div style={CELL}>
          <div className="font-mono uppercase text-faint" style={LABEL_STYLE}>Maturity</div>
          <div className="font-mono" style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
            {maturity_date ? formatDate(maturity_date) : "—"}
          </div>
        </div>

        <div style={CELL}>
          <div className="font-mono uppercase text-faint" style={LABEL_STYLE}>ISIN</div>
          <div className="font-mono" style={{ fontSize: 11, fontWeight: 500, color: "var(--text)", wordBreak: "break-all" }}>
            {isin ?? "—"}
          </div>
        </div>
      </div>

      {/* Computed stat */}
      <div
        style={{
          marginTop: 8,
          padding: "14px 16px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
        }}
      >
        <div className="font-mono uppercase text-faint" style={{ fontSize: 9, letterSpacing: "0.14em", marginBottom: 4 }}>Time to maturity</div>
        <div className="font-mono" style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{timeToMaturity ?? "—"}</div>
      </div>
    </div>
  );
}

"use client";

import { formatDate } from "@/lib/utils";
import { InlineEdit } from "@/components/asset-detail/InlineEdit";
import type { BondsAsset } from "@/lib/supabase";

interface Props {
  asset: BondsAsset;
  onUpdate?: (field: string, value: unknown) => Promise<string | null>;
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

export function BondBlock({ asset, onUpdate }: Props) {
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

      {/* Primary stats — 2×2 grid */}
      <div className="grid grid-cols-2 gap-2">

        {/* Issuer */}
        <div style={CELL}>
          <div className="font-mono uppercase text-faint" style={LABEL_STYLE}>Issuer</div>
          {onUpdate ? (
            <InlineEdit
              display={<span className="font-serif" style={{ fontSize: 13, fontWeight: 400, color: "var(--text)", fontVariationSettings: "'opsz' 144" }}>{issuer ?? "—"}</span>}
              rawValue={issuer ?? ""}
              placeholder="e.g. Netherlands"
              affordance
              displayStyle={{ minHeight: 32, width: "100%" }}
              inputStyle={{ fontSize: 13 }}
              onSave={async (raw) => {
                const v = raw.trim() || null;
                return onUpdate("issuer", v);
              }}
            />
          ) : (
            <div className="font-serif" style={{ fontSize: 13, fontWeight: 400, color: "var(--text)", fontVariationSettings: "'opsz' 144" }}>
              {issuer ?? "—"}
            </div>
          )}
        </div>

        {/* Coupon */}
        <div style={CELL}>
          <div className="font-mono uppercase text-faint" style={LABEL_STYLE}>Coupon</div>
          {onUpdate ? (
            <InlineEdit
              kind="percent"
              display={<span className="font-mono" style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{coupon_rate != null ? `${coupon_rate.toFixed(1)}%` : "—"}</span>}
              rawValue={coupon_rate != null ? String(coupon_rate) : ""}
              placeholder="e.g. 3.5"
              affordance
              displayStyle={{ minHeight: 32, width: "100%" }}
              inputStyle={{ fontSize: 14, fontWeight: 500 }}
              onSave={async (raw) => {
                const t = raw.trim();
                if (t === "") return onUpdate("coupon_rate", null);
                const n = parseFloat(t);
                if (isNaN(n) || n < 0) return "Must be a non-negative number";
                return onUpdate("coupon_rate", n);
              }}
            />
          ) : (
            <div className="font-mono" style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
              {coupon_rate != null ? `${coupon_rate.toFixed(1)}%` : "—"}
            </div>
          )}
        </div>

        {/* Maturity */}
        <div style={CELL}>
          <div className="font-mono uppercase text-faint" style={LABEL_STYLE}>Maturity</div>
          {onUpdate ? (
            <InlineEdit
              kind="date"
              display={<span className="font-mono" style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{maturity_date ? formatDate(maturity_date) : "—"}</span>}
              rawValue={maturity_date ?? ""}
              placeholder="YYYY-MM-DD"
              affordance
              displayStyle={{ minHeight: 32, width: "100%" }}
              inputStyle={{ fontSize: 13, fontWeight: 500 }}
              onSave={async (raw) => {
                const t = raw.trim();
                if (t === "") return onUpdate("maturity_date", null);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return "Use YYYY-MM-DD";
                return onUpdate("maturity_date", t);
              }}
            />
          ) : (
            <div className="font-mono" style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
              {maturity_date ? formatDate(maturity_date) : "—"}
            </div>
          )}
        </div>

        {/* ISIN */}
        <div style={CELL}>
          <div className="font-mono uppercase text-faint" style={LABEL_STYLE}>ISIN</div>
          {onUpdate ? (
            <InlineEdit
              display={<span className="font-mono" style={{ fontSize: 11, fontWeight: 500, color: "var(--text)", wordBreak: "break-all" }}>{isin ?? "—"}</span>}
              rawValue={isin ?? ""}
              placeholder="e.g. NL0009446418"
              affordance
              displayStyle={{ minHeight: 32, width: "100%" }}
              inputStyle={{ fontSize: 11, fontWeight: 500 }}
              onSave={async (raw) => {
                const v = raw.trim().toUpperCase() || null;
                return onUpdate("isin", v);
              }}
            />
          ) : (
            <div className="font-mono" style={{ fontSize: 11, fontWeight: 500, color: "var(--text)", wordBreak: "break-all" }}>
              {isin ?? "—"}
            </div>
          )}
        </div>
      </div>

      {/* Computed stats */}
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

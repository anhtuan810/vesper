"use client";

import { currencySymbol } from "@/lib/utils";

interface Props {
  propertyValue: number;
  mortgageBalance: number;
  currency: string;
}

function fmt(n: number, currency: string): string {
  const sym = currencySymbol(currency);
  if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${sym}${Math.round(n).toLocaleString("en")}`;
  return `${sym}${Math.round(n)}`;
}

export function ValueComposition({ propertyValue, mortgageBalance, currency }: Props) {
  const equity = Math.max(0, propertyValue - mortgageBalance);
  const equityPct = propertyValue > 0 ? (equity / propertyValue) * 100 : 100;
  const mortgagePct = 100 - equityPct;

  return (
    <div
      className="mx-4 mb-0"
      style={{
        padding: "14px 16px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
      }}
    >
      <div
        className="font-mono uppercase text-faint"
        style={{ fontSize: 9, letterSpacing: "0.18em", marginBottom: 10 }}
      >
        Value composition
      </div>

      {/* Stacked bar */}
      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", gap: 2 }}>
        <div
          style={{
            width: `${equityPct}%`,
            height: "100%",
            background: "var(--accent)",
            borderRadius: "3px 0 0 3px",
          }}
        />
        {mortgagePct > 0 && (
          <div
            style={{
              flex: 1,
              height: "100%",
              background: "rgba(255,255,255,0.08)",
              borderRadius: "0 3px 3px 0",
            }}
          />
        )}
      </div>

      {/* Rows */}
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span
              style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }}
            />
            <span style={{ fontSize: 12, color: "var(--text)" }}>Equity</span>
          </div>
          <span className="font-mono" style={{ fontSize: 11, color: "var(--text)" }}>
            {fmt(equity, currency)}
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span
              style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "inline-block" }}
            />
            <span style={{ fontSize: 12, color: "var(--text)" }}>Mortgage owed</span>
          </div>
          <span className="font-mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>
            {fmt(mortgageBalance, currency)}
          </span>
        </div>

        <div
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            paddingTop: 6,
            borderTop: "1px solid var(--border)",
            marginTop: 2,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Property value</span>
          <span className="font-mono" style={{ fontSize: 11, color: "var(--text)" }}>
            {fmt(propertyValue, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

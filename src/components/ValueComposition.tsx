"use client";

import { useDisplayCurrency } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";

interface Props {
  propertyValue: number;
  mortgageBalance: number;
}

export function ValueComposition({ propertyValue, mortgageBalance }: Props) {
  const displayCurrency = useDisplayCurrency();
  const equity = propertyValue - mortgageBalance;
  const isNegative = equity < 0;

  const equityPctVisual = propertyValue > 0
    ? Math.max(0, Math.min(100, (equity / propertyValue) * 100))
    : 100;
  const mortgagePctVisual = 100 - equityPctVisual;

  return (
    <div
      className="mx-4 mb-0"
      style={{
        padding: "14px 16px",
        background: "var(--surface)",
        border: `1px solid ${isNegative ? "rgba(201,122,110,0.25)" : "var(--border)"}`,
        borderRadius: 14,
      }}
    >
      <div
        className="font-mono uppercase text-faint"
        style={{ fontSize: 9, letterSpacing: "0.18em", marginBottom: 10 }}
      >
        Value composition
        {isNegative && (
          <span
            className="font-mono"
            style={{
              marginLeft: 8, padding: "1px 6px", borderRadius: 3,
              background: "rgba(201,122,110,0.12)", color: "var(--negative)",
              letterSpacing: "0.12em",
            }}
          >
            Underwater
          </span>
        )}
      </div>

      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", gap: 2 }}>
        <div
          style={{
            width: `${equityPctVisual}%`,
            height: "100%",
            background: isNegative ? "var(--negative)" : "var(--accent)",
            borderRadius: "3px 0 0 3px",
          }}
        />
        {mortgagePctVisual > 0 && (
          <div
            style={{
              flex: 1, height: "100%",
              background: "rgba(255,255,255,0.08)",
              borderRadius: "0 3px 3px 0",
            }}
          />
        )}
      </div>

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span
              style={{
                width: 6, height: 6, borderRadius: "50%",
                background: isNegative ? "var(--negative)" : "var(--accent)",
                display: "inline-block",
              }}
            />
            <span style={{ fontSize: 12, color: "var(--text)" }}>Equity</span>
          </div>
          <span
            className="font-mono"
            style={{
              fontSize: 11,
              color: isNegative ? "var(--negative)" : "var(--text)",
            }}
          >
            {isNegative ? "−" : ""}{formatMoney(Math.abs(equity), displayCurrency)}
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
            {formatMoney(mortgageBalance, displayCurrency)}
          </span>
        </div>

        <div
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            paddingTop: 6, borderTop: "1px solid var(--border)", marginTop: 2,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Property value</span>
          <span className="font-mono" style={{ fontSize: 11, color: "var(--text)" }}>
            {formatMoney(propertyValue, displayCurrency)}
          </span>
        </div>
      </div>
    </div>
  );
}

"use client";

import { currencySymbol } from "@/lib/utils";
import { formatMoneyParts, type DisplayCurrency } from "@/lib/money";

interface PriceDisplayProps {
  amount: number;
  currency?: string;
  compact?: boolean;
  displayCurrency?: DisplayCurrency;
}

function formatAmount(n: number, compact: boolean): { main: string; suf: string } {
  if (compact) {
    if (n >= 1_000_000) return { main: `${(n / 1_000_000).toFixed(2)}`, suf: "M" };
    if (n >= 1000) return { main: `${(n / 1000).toFixed(1)}`, suf: "k" };
    return { main: `${Math.round(n)}`, suf: "" };
  }
  if (n >= 1_000_000) return { main: n.toLocaleString("en", { maximumFractionDigits: 0 }), suf: "" };
  if (n >= 1000) return { main: n.toLocaleString("en", { maximumFractionDigits: 0 }), suf: "" };
  return { main: n.toFixed(2), suf: "" };
}

// columnGap (not marginRight) keeps the symbol gap immune to parent's negative letter-spacing
export function PriceDisplay({ amount, currency = "USD", compact = false, displayCurrency }: PriceDisplayProps) {
  if (displayCurrency) {
    const parts = formatMoneyParts(amount, currency, displayCurrency);
    return (
      <span style={{ display: "inline-flex", alignItems: "flex-start", columnGap: "0.12em" }}>
        {parts.sign && <span style={{ lineHeight: "inherit" }}>{parts.sign}</span>}
        <span
          className="text-dim"
          style={{ fontSize: "0.55em", lineHeight: 1, paddingTop: "0.07em" }}
        >
          {parts.symbol}
        </span>
        <span style={{ lineHeight: "inherit" }}>{parts.amount}</span>
      </span>
    );
  }

  const sym = currencySymbol(currency);
  const { main, suf } = formatAmount(amount, compact);

  return (
    <span style={{ display: "inline-flex", alignItems: "flex-start", columnGap: "0.12em" }}>
      <span
        className="text-dim"
        style={{
          fontSize: "0.55em",
          lineHeight: 1,
          paddingTop: "0.07em",
        }}
      >
        {sym}
      </span>
      <span style={{ lineHeight: "inherit" }}>
        {main}
        {suf && (
          <span className="text-dim" style={{ fontSize: "0.64em" }}>
            {suf}
          </span>
        )}
      </span>
    </span>
  );
}

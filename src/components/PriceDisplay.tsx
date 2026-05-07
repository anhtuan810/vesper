"use client";

import { currencySymbol } from "@/lib/utils";

interface PriceDisplayProps {
  amount: number;
  currency?: string;
  compact?: boolean;
}

function formatAmount(n: number, compact: boolean): string {
  if (compact) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return `${Math.round(n)}`;
  }
  if (n >= 1_000_000) return n.toLocaleString("en", { maximumFractionDigits: 0 });
  if (n >= 1000) return n.toLocaleString("en", { maximumFractionDigits: 0 });
  return n.toFixed(2);
}

/**
 * Renders a price with a correctly positioned dimmed currency prefix.
 * Inherits font-family, font-size, and color from the parent element.
 * Use `compact` for abbreviated display (e.g. "491.8k"), full precision otherwise.
 */
export function PriceDisplay({ amount, currency = "EUR", compact = false }: PriceDisplayProps) {
  const sym = currencySymbol(currency);
  const formatted = formatAmount(amount, compact);

  return (
    <>
      <span
        className="text-dim inline-block"
        style={{ fontSize: "0.56em", verticalAlign: "top", lineHeight: "1.55", marginRight: 3 }}
      >
        {sym}
      </span>
      {formatted}
    </>
  );
}

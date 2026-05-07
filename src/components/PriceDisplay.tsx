"use client";

import { currencySymbol } from "@/lib/utils";

interface PriceDisplayProps {
  amount: number;
  currency?: string;
  compact?: boolean;
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

/**
 * Renders a price with a superscript-style currency symbol.
 *
 * Layout: inline-flex so the gap between symbol and number is controlled by
 * `columnGap` (em-relative) rather than `marginRight`. This makes the gap
 * immune to the parent's negative `letter-spacing`, which previously caused
 * the € to visually collide with the first digit at large font sizes.
 *
 * The suffix ("k", "M") stays inline inside the number span so it remains
 * baseline-aligned — matching the current compact display appearance.
 */
export function PriceDisplay({ amount, currency = "EUR", compact = false }: PriceDisplayProps) {
  const sym = currencySymbol(currency);
  const { main, suf } = formatAmount(amount, compact);

  return (
    <span style={{ display: "inline-flex", alignItems: "flex-start", columnGap: "0.12em" }}>
      <span
        className="text-dim"
        style={{
          fontSize: "0.55em",
          lineHeight: 1,
          // Nudge the symbol down so its cap height aligns with the adjacent number's cap height.
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

import { formatMoney, isSupportedCurrency } from "@/lib/money";
import type { PriceResult } from "@/lib/prices-server";

const fmtPlainPct = (n: number): string =>
  new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + "%";

// One on-brand line for a live quote. The figure comes straight from the market
// feed (never the model), so it can't be hallucinated. Rendered in the listing's
// OWN currency (a US stock in USD, a Xetra line in EUR) — €/$/£ via formatMoney,
// any other ISO currency via a plain number + code — with the day's move when a
// previous close is available. Bolds the name + figures per the chat's formatting.
export function formatPriceLine(label: string, quote: PriceResult): string {
  const cur = quote.nativeCurrency || "USD";
  const priceStr = isSupportedCurrency(cur)
    ? formatMoney(quote.price, cur, cur, 2)
    : `${new Intl.NumberFormat("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(quote.price)} ${cur}`;

  let changeStr = "";
  if (quote.previousClose > 0) {
    const pct = ((quote.price - quote.previousClose) / quote.previousClose) * 100;
    const sign = pct >= 0 ? "+" : "−";
    changeStr = ` (${sign}${fmtPlainPct(Math.abs(pct))} on the day)`;
  }

  return `**${label}** is trading at **${priceStr}**${changeStr}. Want me to add a position or run a what-if?`;
}

import { TYPE_COLOR_TOKENS } from "@/lib/tokens";
import { computeCurrentBalance } from "@/lib/mortgage";

export const TYPE_COLOR: Record<string, string> = TYPE_COLOR_TOKENS;

export const TYPE_LABEL: Record<string, string> = {
  stocks: "Stocks", etf: "ETF", crypto: "Crypto", bonds: "Bonds",
  gold: "Gold", real_estate: "Real Estate", cash: "Cash",
  pension: "Pension", other: "Other",
};

export const ACTION_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  add: { label: "ADD", color: "#6BAA75", bg: "rgba(107,170,117,0.12)" },
  edit: { label: "EDIT", color: "#D4A574", bg: "rgba(212,165,116,0.12)" },
  remove: { label: "DEL", color: "#C97A6E", bg: "rgba(201,122,110,0.12)" },
};

const CURRENCY_SYMBOL: Record<string, string> = {
  EUR: "€", USD: "$", GBP: "£", CHF: "Fr",
  JPY: "¥", CAD: "CA$", AUD: "A$", HKD: "HK$",
};

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOL[code?.toUpperCase()] ?? code;
}

// English ordinal suffix for a rank/percentile: 1st, 2nd, 3rd, 4th–20th "th",
// then 21st/22nd/23rd, with 11th/12th/13th kept as "th". Returns the suffix only
// (so callers can style the number and suffix separately).
export function ordinalSuffix(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (abs % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

export function pctChange(price?: number, prev?: number): number | null {
  if (!price || !prev) return null;
  return ((price - prev) / prev) * 100;
}

export function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("T")[0].split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const currentYear = new Date().getFullYear();
  if (y === currentYear) {
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function getMonthLabel(key: string): string {
  const [year, month] = key.split("-");
  const d = new Date(+year, +month - 1);
  const currentYear = new Date().getFullYear();
  if (+year === currentYear) {
    return d.toLocaleDateString("en-GB", { month: "long" });
  }
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function computeNetWorth(
  assets: Array<{
    type: string;
    value: number;
    currency?: string | null;
    mortgage_balance?: number | null;
    mortgage_balance_recorded_at?: string | null;
    mortgage_rate?: number | null;
    monthly_payment?: number | null;
    mortgage_type?: string | null;
  }>,
  toUsd: (amount: number, currency: string) => number = (a) => a
): number {
  return assets.reduce((sum, a) => {
    const cur = a.currency || "USD";
    const valueUsd = toUsd(a.value, cur);
    // Real estate contributes equity = value − current (amortized) mortgage balance,
    // the same basis the Portfolio hero and the allocation donut use, so this stays
    // matched as the loan amortizes. computeCurrentBalance degrades to the stored
    // balance when the amortization fields (recorded_at/rate/payment/type) are absent.
    const mortgageUsd = a.type === "real_estate" ? toUsd(computeCurrentBalance(a), cur) : 0;
    return sum + valueUsd - mortgageUsd;
  }, 0);
}

const EXCHANGE_SUFFIXES = new Set([
  "AS", "L", "PA", "DE", "F", "SW", "MI", "MC", "BR", "LS", "HE", "ST", "OL",
  "CO", "VI", "WA", "HK", "T", "AX", "NZ", "SI", "KS", "KQ", "TO", "V", "SA",
  "MX", "BA",
]);

export function displayTicker(symbol: string): string {
  const dot = symbol.lastIndexOf(".");
  if (dot === -1) return symbol;
  const suffix = symbol.slice(dot + 1).toUpperCase();
  return EXCHANGE_SUFFIXES.has(suffix) ? symbol.slice(0, dot) : symbol;
}


import { TYPE_COLOR_TOKENS } from "@/lib/tokens";

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

export function fmt(n: number, currency = "EUR"): string {
  const sym = currencySymbol(currency);
  if (n >= 1000000) return `${sym}${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${sym}${(n / 1000).toFixed(1)}k`;
  return `${sym}${Math.round(n)}`;
}

export function fmtAmount(n: number, currency: string): string {
  const sym = currencySymbol(currency);
  if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${sym}${Math.round(n).toLocaleString("en")}`;
  return `${sym}${Math.round(n)}`;
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
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function getWarnings(
  assets: { name: string; value: number; type: string }[],
  byType: Record<string, number>,
  total: number
): string[] {
  const warnings: string[] = [];
  const sorted = [...assets].sort((a, b) => b.value - a.value);
  if (sorted.length > 0 && sorted[0].value / total > 0.4) {
    warnings.push(`${sorted[0].name} is ${((sorted[0].value / total) * 100).toFixed(0)}% of your portfolio — high concentration.`);
  }
  const typeEntries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  if (typeEntries.length > 0 && typeEntries[0][1] / total > 0.6) {
    warnings.push(`${TYPE_LABEL[typeEntries[0][0]]} makes up ${((typeEntries[0][1] / total) * 100).toFixed(0)}% — consider diversifying.`);
  }
  if (typeEntries.length === 1 && assets.length > 1) {
    warnings.push("All positions are in one asset class.");
  }
  if (byType.cash && byType.cash / total > 0.3) {
    warnings.push(`${((byType.cash / total) * 100).toFixed(0)}% in cash — consider deploying some.`);
  }
  return warnings;
}

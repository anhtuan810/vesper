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

export function computeNetWorth(
  assets: Array<{ type: string; value: number; mortgage_balance?: number | null }>
): number {
  return assets.reduce((sum, a) => {
    const net = a.type === "real_estate" ? a.value - (a.mortgage_balance ?? 0) : a.value;
    return sum + net;
  }, 0);
}

export interface Warning {
  key: string;
  text: string;
}

export function getWarnings(
  assets: { name: string; value: number; type: string }[],
  byType: Record<string, number>,
  total: number
): Warning[] {
  const warnings: Warning[] = [];
  const sorted = [...assets].sort((a, b) => b.value - a.value);
  if (sorted.length > 0 && sorted[0].value / total > 0.4) {
    warnings.push({
      key: `concentration:position:${sorted[0].name.toLowerCase()}`,
      text: `${sorted[0].name} is ${((sorted[0].value / total) * 100).toFixed(0)}% of your portfolio — high concentration.`,
    });
  }
  const typeEntries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  if (typeEntries.length > 0 && typeEntries[0][1] / total > 0.6) {
    warnings.push({
      key: `concentration:type:${typeEntries[0][0]}`,
      text: `${TYPE_LABEL[typeEntries[0][0]]} makes up ${((typeEntries[0][1] / total) * 100).toFixed(0)}% — consider diversifying.`,
    });
  }
  if (typeEntries.length === 1 && assets.length > 1) {
    warnings.push({ key: "concentration:single_class", text: "All positions are in one asset class." });
  }
  if (byType.cash && byType.cash / total > 0.3) {
    warnings.push({
      key: "concentration:cash",
      text: `${((byType.cash / total) * 100).toFixed(0)}% in cash — consider deploying some.`,
    });
  }
  return warnings;
}

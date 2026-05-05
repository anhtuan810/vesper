export const TYPE_COLOR: Record<string, string> = {
  stocks: "#2563EB", etf: "#0891B2", crypto: "#7C3AED",
  bonds: "#059669", gold: "#D97706", real_estate: "#DC2626",
  cash: "#475569", pension: "#6366F1", other: "#78716C",
};

export const TYPE_LABEL: Record<string, string> = {
  stocks: "Stocks", etf: "ETF", crypto: "Crypto", bonds: "Bonds",
  gold: "Gold", real_estate: "Real Estate", cash: "Cash",
  pension: "Pension", other: "Other",
};

export const ACTION_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  add: { label: "Add", color: "#059669", bg: "#ECFDF5" },
  edit: { label: "Edit", color: "#2563EB", bg: "#EFF6FF" },
  remove: { label: "Del", color: "#DC2626", bg: "#FEF2F2" },
};

export interface DashboardMutation {
  id: string;
  asset_name: string;
  action: string;
  before_value: number | null;
  after_value: number | null;
  personal_context: string | null;
  market_context: string | null;
  portfolio_total: number | null;
  occurred_at: string | null;
  recorded_at: string;
  asset_type: string | null;
  symbol: string | null;
}

export function fmt(n: number): string {
  if (n >= 1000000) return `€${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `€${(n / 1000).toFixed(1)}k`;
  return `€${Math.round(n)}`;
}

export function pctChange(price?: number, prev?: number): number | null {
  if (!price || !prev) return null;
  return ((price - prev) / prev) * 100;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function getMonthLabel(key: string): string {
  const [year, month] = key.split("-");
  const d = new Date(parseInt(year), parseInt(month) - 1);
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

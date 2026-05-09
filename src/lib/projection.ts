import { currencySymbol } from "@/lib/utils";
import { getEurRate, type DisplayCurrency } from "@/lib/money";

// Dynamic milestone step sizing — scales with portfolio size
export function getNextMilestone(currentTotal: number): { target: number; step: number } {
  let step: number;

  if (currentTotal < 10000) step = 1000;
  else if (currentTotal < 50000) step = 5000;
  else if (currentTotal < 100000) step = 10000;
  else if (currentTotal < 500000) step = 50000;
  else if (currentTotal < 1000000) step = 100000;
  else if (currentTotal < 5000000) step = 500000;
  else step = 1000000;

  const target = (Math.floor(currentTotal / step) + 1) * step;

  return { target, step };
}

// Calculate progress toward next milestone.
// eurTotal is the EUR net worth. Returns display-currency labels and target.
export function getMilestoneProgress(eurTotal: number, displayCurrency: DisplayCurrency = "EUR"): {
  target: number;
  previous: number;
  progress: number; // 0-100
  remaining: number;
  label: string;
} {
  const rate = getEurRate(displayCurrency);
  const displayTotal = eurTotal * rate;
  const { target, step } = getNextMilestone(displayTotal);
  const previous = target - step;
  const progress = ((displayTotal - previous) / (target - previous)) * 100;
  const remaining = target - displayTotal;
  const sym = currencySymbol(displayCurrency);

  let label: string;
  if (target >= 1000000) label = `${sym}${(target / 1000000).toFixed(1)}M`;
  else if (target >= 1000) label = `${sym}${(target / 1000).toFixed(0)}k`;
  else label = `${sym}${target}`;

  return {
    target,
    previous,
    progress: Math.min(Math.max(progress, 0), 100),
    remaining,
    label,
  };
}

// Format remaining amount (value already in display currency).
export function fmtRemaining(n: number, currency: string = "EUR"): string {
  const sym = currencySymbol(currency);
  if (n >= 1000000) return `${sym}${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${sym}${(n / 1000).toFixed(1)}k`;
  return `${sym}${Math.round(n)}`;
}

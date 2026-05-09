export type DisplayCurrency = "EUR" | "USD" | "GBP";

export const SUPPORTED_CURRENCIES: DisplayCurrency[] = ["EUR", "USD", "GBP"];

export function isSupportedCurrency(s: unknown): s is DisplayCurrency {
  return s === "EUR" || s === "USD" || s === "GBP";
}

interface CurrencyMeta {
  symbol: string;
  locale: string;
}

const CURRENCY_META: Record<DisplayCurrency, CurrencyMeta> = {
  EUR: { symbol: "€", locale: "nl-NL" },
  USD: { symbol: "$", locale: "en-US" },
  GBP: { symbol: "£", locale: "en-GB" },
};

// Last reviewed: 2026. These drift over time; review annually.
const FALLBACK_RATES: Partial<Record<DisplayCurrency, number>> = {
  USD: 1.12,
  GBP: 0.85,
};

// Client-side module-level EUR→X rate cache, seeded with fallback rates.
// Populated at runtime by useDisplayCurrency() via setEurRate().
const eurRateCache: Partial<Record<DisplayCurrency, number>> = {
  ...FALLBACK_RATES,
};

export function setEurRate(currency: DisplayCurrency, rate: number): void {
  eurRateCache[currency] = rate;
}

export function getEurRate(currency: DisplayCurrency): number {
  if (currency === "EUR") return 1;
  return eurRateCache[currency] ?? FALLBACK_RATES[currency] ?? 1;
}

export interface MoneyParts {
  symbol: string;
  amount: string;
  code: string;
  sign: string;
}

export function formatMoney(
  eurValue: number,
  displayCurrency: DisplayCurrency
): string {
  const rate = getEurRate(displayCurrency);
  const displayValue = Math.round(eurValue * rate);
  const absValue = Math.abs(displayValue);
  const sign = displayValue < 0 ? "-" : "";
  const { symbol, locale } = CURRENCY_META[displayCurrency];
  const amount = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(absValue);
  return `${sign}${symbol}${amount}`;
}

export function formatMoneyParts(
  eurValue: number,
  displayCurrency: DisplayCurrency
): MoneyParts {
  const rate = getEurRate(displayCurrency);
  const displayValue = Math.round(eurValue * rate);
  const absValue = Math.abs(displayValue);
  const sign = displayValue < 0 ? "-" : "";
  const { symbol, locale } = CURRENCY_META[displayCurrency];
  const amount = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(absValue);
  return { symbol, amount, code: displayCurrency, sign };
}

import { USD_FALLBACK_RATES, FX_STALE_AFTER_MS } from "@/lib/constants";

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
  USD: { symbol: "$", locale: "nl-NL" },
  GBP: { symbol: "£", locale: "nl-NL" },
};

const FALLBACK_RATES: Partial<Record<DisplayCurrency, number>> = {
  EUR: USD_FALLBACK_RATES.EUR,
  GBP: USD_FALLBACK_RATES.GBP,
};

// Client-side module-level USD→X rate cache, seeded with fallback rates.
// Populated at runtime by useFxRate() / useDisplayCurrency() via setUsdRate().
const usdRateCache: Partial<Record<DisplayCurrency, number>> = {
  ...FALLBACK_RATES,
};

// Tracks when each rate was last written by a live fetch (not from fallback seed).
const rateTimestamps = new Map<DisplayCurrency, number>();

const FRESH_MS  = 60 * 60 * 1000; // 1h
const STALE_MS  = FX_STALE_AFTER_MS;

export type FxFreshness = "fresh" | "stale" | "unavailable";

export function setUsdRate(currency: DisplayCurrency, rate: number): void {
  usdRateCache[currency] = rate;
  rateTimestamps.set(currency, Date.now());
}

export function getUsdRate(currency: DisplayCurrency): number {
  if (currency === "USD") return 1;
  return usdRateCache[currency] ?? FALLBACK_RATES[currency] ?? 1;
}

export function getRateFreshness(currency: DisplayCurrency): FxFreshness {
  if (currency === "USD") return "fresh";
  const ts = rateTimestamps.get(currency);
  if (ts === undefined) {
    return usdRateCache[currency] !== undefined ? "stale" : "unavailable";
  }
  const age = Date.now() - ts;
  if (age <= FRESH_MS)  return "fresh";
  if (age <= STALE_MS)  return "stale";
  return "unavailable";
}

/**
 * Converts an amount in any currency to USD using the client-side rate cache.
 * Uses USD as the internal bridge. Works precisely for EUR and GBP;
 * other currencies fall back to treating 1:1 with USD.
 */
export function toUsdClient(amount: number, fromCurrency: string): number {
  if (!fromCurrency || fromCurrency === "USD") return amount;
  const rate = getUsdRate(fromCurrency as DisplayCurrency);
  // rate = 1 USD = N fromCurrency → USD = fromCurrency / rate
  return rate > 0 ? amount / rate : amount;
}

/**
 * Converts a display-currency amount to USD.
 * Synchronous — reads from the in-process rate cache.
 */
export function convertToUsd(displayValue: number, displayCurrency: DisplayCurrency): number {
  if (displayCurrency === "USD") return displayValue;
  const rate = getUsdRate(displayCurrency);
  return displayValue / rate;
}

export interface MoneyParts {
  symbol: string;
  amount: string;
  code: string;
  sign: string;
}

/**
 * Formats a monetary amount for display.
 * @param amount       Value in `fromCurrency`.
 * @param fromCurrency The currency the value is stored in (e.g. "EUR", "USD", "GBP").
 * @param displayCurrency The user's chosen display currency.
 */
export function formatMoney(
  amount: number,
  fromCurrency: string,
  displayCurrency: DisplayCurrency
): string {
  const usdAmount = toUsdClient(amount, fromCurrency);
  const rate = getUsdRate(displayCurrency);
  const displayValue = Math.round(usdAmount * rate);
  const absValue = Math.abs(displayValue);
  const sign = displayValue < 0 ? "-" : "";
  const { symbol, locale } = CURRENCY_META[displayCurrency];
  const amount_ = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(absValue);
  return `${sign}${symbol}${amount_}`;
}

const inFlightFetches = new Map<DisplayCurrency, Promise<number | null>>();

/**
 * Fetches the latest USD→currency rate, deduping concurrent calls.
 */
export function fetchUsdRate(currency: DisplayCurrency): Promise<number | null> {
  if (currency === "USD") return Promise.resolve(1);

  const existing = inFlightFetches.get(currency);
  if (existing) return existing;

  const promise = fetch(`/api/fx?base=USD&quote=${currency}`)
    .then((r) => r.json())
    .then((data) => {
      if (typeof data.rate === "number") {
        setUsdRate(currency, data.rate);
        return data.rate as number;
      }
      return null;
    })
    .catch(() => null)
    .finally(() => {
      inFlightFetches.delete(currency);
    });

  inFlightFetches.set(currency, promise);
  return promise;
}

export function formatMoneyParts(
  amount: number,
  fromCurrency: string,
  displayCurrency: DisplayCurrency
): MoneyParts {
  const usdAmount = toUsdClient(amount, fromCurrency);
  const rate = getUsdRate(displayCurrency);
  const displayValue = Math.round(usdAmount * rate);
  const absValue = Math.abs(displayValue);
  const sign = displayValue < 0 ? "-" : "";
  const { symbol, locale } = CURRENCY_META[displayCurrency];
  const amount_ = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(absValue);
  return { symbol, amount: amount_, code: displayCurrency, sign };
}

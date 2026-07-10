import { USD_FALLBACK_RATES, FX_STALE_AFTER_MS } from "@/lib/constants";
import { convertCurrency } from "@/lib/currency-convert";
import { apiFetch } from "@/lib/api";

export type DisplayCurrency = "EUR" | "USD" | "GBP";

export const SUPPORTED_CURRENCIES: DisplayCurrency[] = ["EUR", "USD", "GBP"];

export function isSupportedCurrency(s: unknown): s is DisplayCurrency {
  return s === "EUR" || s === "USD" || s === "GBP";
}

interface CurrencyMeta {
  symbol: string;
  locale: string;
}

// nl-NL number grammar (period thousands, comma decimals: €6.025,50) for every
// display currency — matching the rest of the app's figures (the chart axis,
// percentages, unit counts all hard-code nl-NL) and the brand's stated
// formatting. Previously en-US (comma thousands), which made money read
// inconsistently against everything else.
const CURRENCY_META: Record<DisplayCurrency, CurrencyMeta> = {
  EUR: { symbol: "€", locale: "nl-NL" },
  USD: { symbol: "$", locale: "nl-NL" },
  GBP: { symbol: "£", locale: "nl-NL" },
};

// Client-side module-level USD→X rate cache, seeded with the bundled majors
// (EUR, GBP, CHF, JPY, CAD, AUD, HKD). Seeding ALL of them — not just the three
// display currencies — is what lets a holding in a non-display native currency
// (a Tokyo, Zürich, Toronto or Hong Kong listing) convert correctly before any
// live rate loads, instead of failing to null → counted as 0 in totals and
// ~100× in its own row. Live fetches (useFxRate) overwrite the display
// currency's entry; the rest ride on these approximate fallbacks (right
// magnitude). Keyed by string so any currency can be cached, not only the three.
const usdRateCache: Record<string, number> = {
  ...USD_FALLBACK_RATES,
};

// Tracks when each rate was last written by a live fetch (not from fallback seed).
const rateTimestamps = new Map<string, number>();

const FRESH_MS  = 60 * 60 * 1000; // 1h
const STALE_MS  = FX_STALE_AFTER_MS;

export type FxFreshness = "fresh" | "stale" | "unavailable";

// Accepts ANY currency code — the cache is deliberately string-keyed so live
// rates for non-display native currencies (CHF, JPY, CAD…) can replace the
// bundled fallback approximations, keeping per-position figures consistent with
// totals computed on live rates.
export function setUsdRate(currency: string, rate: number): void {
  usdRateCache[currency] = rate;
  rateTimestamps.set(currency, Date.now());
}

// USD→currency rate for ANY currency the app can encounter — not just the three
// display currencies. GBp (pence) is 1/100 of a pound, so its USD rate is the GBP
// rate × 100. Unknown currencies degrade to 1:1 with USD (unchanged behaviour).
export function getUsdRate(currency: string): number {
  if (currency === "USD") return 1;
  if (currency === "GBp") return (usdRateCache.GBP ?? USD_FALLBACK_RATES.GBP ?? 1) * 100;
  return usdRateCache[currency] ?? USD_FALLBACK_RATES[currency] ?? 1;
}

// The USD-based rate table convertCurrency needs to bridge from→to. Covers every
// currency we have a rate for (the seeded/live cache + the bundled majors) plus
// GBp as GBP×100, so a non-display native currency converts through USD instead
// of returning null (which callers coerce to 0 in totals, and which the money
// formatters otherwise "rescue" by mis-scaling the raw native number ~100×).
function usdRateTable(): Record<string, number> {
  const table: Record<string, number> = { ...USD_FALLBACK_RATES, ...usdRateCache };
  if (table.GBP != null) table.GBp = table.GBP * 100;
  return table;
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

/**
 * Cross-rate conversion using the client-side rate cache. Identity
 * short-circuit for from === to — returns the input unchanged even before
 * rates have loaded, avoiding a load flash for home-currency amounts.
 * Returns null only if a needed rate is missing.
 */
export function toDisplay(amount: number, from: string, to: string): number | null {
  if (from === to) return amount;
  return convertCurrency(amount, from, to, usdRateTable());
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
  displayCurrency: DisplayCurrency,
  decimals: number = 0
): string {
  let displayValue: number;
  if (fromCurrency === displayCurrency) {
    // Identity — no rate lookup, renders correctly even before rates load.
    displayValue = amount;
  } else {
    const converted = convertCurrency(amount, fromCurrency, displayCurrency, usdRateTable());
    // Missing cross-rate (a currency outside even the bundled majors) — fall back
    // to treating the native amount as USD-equivalent rather than producing NaN.
    displayValue = converted != null ? converted : amount * getUsdRate(displayCurrency);
  }
  const absValue = Math.abs(displayValue);
  // Real minus sign (U+2212), matching every other negative figure in the app.
  const sign = displayValue < 0 ? "−" : "";
  const { symbol, locale } = CURRENCY_META[displayCurrency];
  const amount_ = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(absValue);
  return `${sign}${symbol}${amount_}`;
}

/**
 * Compact money for chart labels, stat chips and tight rows: converts to the
 * display currency (same path as formatMoney), then abbreviates. ONE scheme
 * app-wide — uppercase K/M, nl-NL comma decimals, U+2212 minus: €1,2M · €115K · €640.
 */
export function formatMoneyCompact(
  amount: number,
  fromCurrency: string,
  displayCurrency: DisplayCurrency
): string {
  let displayValue: number;
  if (fromCurrency === displayCurrency) {
    displayValue = amount;
  } else {
    const converted = convertCurrency(amount, fromCurrency, displayCurrency, usdRateTable());
    displayValue = converted != null ? converted : amount * getUsdRate(displayCurrency);
  }
  const abs = Math.abs(displayValue);
  const sign = displayValue < 0 ? "−" : "";
  const { symbol } = CURRENCY_META[displayCurrency];
  // Roll to "M" once rounding to K would read "1000K" (abs ≥ 999,500 rounds the
  // K figure up to 1000) — otherwise the top sliver of the sub-million band broke
  // the compact scheme with a four-digit K.
  if (abs >= 999_500) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (abs >= 1_000) return `${sign}${symbol}${Math.round(abs / 1_000)}K`;
  return `${sign}${symbol}${Math.round(abs)}`;
}

const inFlightFetches = new Map<DisplayCurrency, Promise<number | null>>();

/**
 * Fetches the latest USD→currency rate, deduping concurrent calls.
 */
export function fetchUsdRate(currency: DisplayCurrency): Promise<number | null> {
  if (currency === "USD") return Promise.resolve(1);

  const existing = inFlightFetches.get(currency);
  if (existing) return existing;

  const promise = apiFetch(`/api/fx?base=USD&quote=${currency}`)
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
  displayCurrency: DisplayCurrency,
  decimals: number = 0
): MoneyParts {
  const usdAmount = toUsdClient(amount, fromCurrency);
  const rate = getUsdRate(displayCurrency);
  const displayValue = usdAmount * rate;
  const absValue = Math.abs(displayValue);
  const sign = displayValue < 0 ? "−" : "";
  const { symbol, locale } = CURRENCY_META[displayCurrency];
  const amount_ = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(absValue);
  return { symbol, amount: amount_, code: displayCurrency, sign };
}

import type { DisplayCurrency } from "./money";

/**
 * Maps ISO-2 country codes to native property currencies for real-estate assets.
 * Covers EUR zone, USD, and GBP — the three supported display currencies at launch.
 *
 * To add a new currency: add its supported countries here AND add the currency
 * to the DisplayCurrency union in money.ts, to SUPPORTED_CURRENCIES, to CURRENCY_META,
 * and to the milestone step table in projection.ts (if the step pattern differs).
 * Countries with unsupported native currencies (CH→CHF, SE→SEK, etc.) fall back to EUR as the closest supported native currency; apply-changes converts that to USD for storage via toUsd().
 */
const COUNTRY_TO_CURRENCY: Record<string, DisplayCurrency> = {
  // EUR zone (eurozone member states; extend as needed)
  NL: "EUR", DE: "EUR", FR: "EUR", BE: "EUR", ES: "EUR", IT: "EUR",
  AT: "EUR", PT: "EUR", IE: "EUR", FI: "EUR", GR: "EUR", LU: "EUR",
  SK: "EUR", SI: "EUR", EE: "EUR", LV: "EUR", LT: "EUR", CY: "EUR",
  MT: "EUR",
  // USD
  US: "USD",
  // GBP
  GB: "GBP", UK: "GBP",
};

/**
 * Returns the property's native currency for a given country code.
 * Defaults to EUR for null, empty, or unmapped countries
 * (e.g. Switzerland → CHF is out of scope at launch; falls back to EUR as best approximation).
 * The returned currency is the native denomination — apply-changes.ts converts to USD for storage.
 */
export function countryToCurrency(country: string | null | undefined): DisplayCurrency {
  if (!country) return "EUR";
  return COUNTRY_TO_CURRENCY[country.toUpperCase()] ?? "EUR";
}

/**
 * Returns true when the country maps to one of the supported property currencies.
 * Countries that fall back to EUR (e.g. CH) still return true — EUR is always supported.
 */
export function isSupportedPropertyCountry(country: string | null | undefined): boolean {
  if (!country) return false;
  return country.toUpperCase() in COUNTRY_TO_CURRENCY;
}

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

/**
 * ISO-2 → readable country name, so a stored code ("NL") renders as a label
 * ("Netherlands"). Covers the supported property countries plus common European
 * neighbours a user might own a home in. Anything unknown is shown as stored.
 */
const COUNTRY_NAME_BY_CODE: Record<string, string> = {
  NL: "Netherlands", DE: "Germany", FR: "France", BE: "Belgium", ES: "Spain",
  IT: "Italy", AT: "Austria", PT: "Portugal", IE: "Ireland", FI: "Finland",
  GR: "Greece", LU: "Luxembourg", SK: "Slovakia", SI: "Slovenia", EE: "Estonia",
  LV: "Latvia", LT: "Lithuania", CY: "Cyprus", MT: "Malta",
  US: "United States", GB: "United Kingdom", UK: "United Kingdom",
  CH: "Switzerland", SE: "Sweden", NO: "Norway", DK: "Denmark", PL: "Poland",
  CZ: "Czechia",
};

// Reverse lookup (lower-cased name → ISO-2), plus the aliases people actually
// type, so "The Netherlands", "USA", "UK", "England" all resolve to a code.
const CODE_BY_NAME: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [code, name] of Object.entries(COUNTRY_NAME_BY_CODE)) m[name.toLowerCase()] = code;
  Object.assign(m, {
    "the netherlands": "NL", holland: "NL",
    usa: "US", "u.s.": "US", "u.s.a.": "US", "united states of america": "US", america: "US",
    // Pin to the standard ISO-2 "GB" (the map also carries a "UK" alias code).
    "united kingdom": "GB", "great britain": "GB", england: "GB", scotland: "GB", wales: "GB",
    czech: "CZ", "czech republic": "CZ",
  });
  return m;
})();

/**
 * Resolve a free-text country (a full name, alias, or an already-ISO-2 code) to
 * an ISO-2 code, or null when it isn't a recognised country. Used to recover a
 * property's country from the last segment of its canonical address.
 */
export function countryNameToCode(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  const byName = CODE_BY_NAME[trimmed.toLowerCase()];
  if (byName) return byName;
  const up = trimmed.toUpperCase();
  return up.length === 2 && up in COUNTRY_NAME_BY_CODE ? up : null;
}

/**
 * The country code carried in the last segment of a canonical address
 * ("Street 1, 1234 AB City, Netherlands" → "NL"). Null when the address has no
 * recognisable country tail (e.g. a bare "Street, City"), so a city is never
 * mistaken for a country.
 */
export function countryFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  return countryNameToCode(parts[parts.length - 1]);
}

/**
 * A readable label for a stored country value, whether it's an ISO-2 code ("NL")
 * or already a name ("Netherlands"). Empty string for null/blank.
 */
export function countryDisplayName(country: string | null | undefined): string {
  if (!country) return "";
  const raw = country.trim();
  if (!raw) return "";
  return COUNTRY_NAME_BY_CODE[raw.toUpperCase()] ?? raw;
}

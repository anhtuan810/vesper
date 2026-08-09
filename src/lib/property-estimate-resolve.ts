// Orchestrates the prompt-1 estimate engine for the chat add flow: address →
// region → CBS PBK index → deterministic indicative current value. Pure
// consumption of the engine/CBS client (does not modify them). Server-side only;
// every failure returns { available: false } — never throws. NO LLM.

import { resolveRegion } from "@/lib/property-region";
import { getRegionIndex, targetRegionName } from "@/lib/cbs-pbk";
import { estimateValue, normalizeIndex, parseBuyYear } from "@/lib/property-estimate";
import { effectivePropertyCountry, countryNameToCode, countryDisplayName } from "@/lib/country-currency";
import { getNationalIndex } from "@/lib/national-price-index";

export interface PropertyEstimate {
  available: boolean;
  currentEstimate?: number; // rounded, in the property's native currency
  regionName?: string;
  regionCode?: string;
  asOfPeriod?: string;
  // The earliest year the ACTUAL series used has data for — CBS starts ~1995,
  // but a national (Eurostat) series can start anywhere per country. The caller
  // captions "since {this year}" whenever the buy year predates it, instead of
  // assuming the CBS-specific 1995 floor (which used to be hardcoded and would
  // misreport a national series' true start).
  seriesStartYear?: number;
  clamped?: boolean; // buy date predated seriesStartYear
}

const UNAVAILABLE: PropertyEstimate = { available: false };

function isNL(country: string | null | undefined): boolean {
  const c = (country || "").trim().toUpperCase();
  return c === "NL" || c === "NLD" || c === "NETHERLANDS" || c === "THE NETHERLANDS";
}

// Indicative current value = buyPrice × (index_latest / index_buyYear). Two
// tiers, best-available wins:
//   1. NL regional (CBS via the resolved gemeente/province) — the finest shape.
//   2. National (Eurostat, pre-seeded, keyed by country only — no geocoding) —
//      covers every country the address/country names, including NL when the
//      address doesn't resolve. Replaces the old "NL only, else unavailable".
// Any logged purchase (price + date) qualifies; country/address only decide
// which index tier answers. Still UNAVAILABLE with no usable purchase or index.
export async function estimatePropertyValue(opts: {
  address: string | null;
  country: string | null;
  buyPrice: number | null;
  buyDate: string | null;
}): Promise<PropertyEstimate> {
  try {
    if (!opts.buyPrice || opts.buyPrice <= 0) return UNAVAILABLE;
    const buyYear = parseBuyYear(opts.buyDate);
    if (buyYear == null) return UNAVAILABLE;

    const country = effectivePropertyCountry(opts.country, opts.address);

    // Tier 1 — NL regional.
    if (opts.address && isNL(country)) {
      const region = await resolveRegion(opts.address);
      if (region) {
        const idx = await getRegionIndex(region.gemeente, region.province);
        if (idx && idx.points.length > 0) {
          const est = estimateValue(opts.buyPrice, buyYear, idx.points);
          if (est != null) {
            const startYear = normalizeIndex(idx.points)[0].year;
            return {
              available: true,
              currentEstimate: Math.round(est),
              regionName: targetRegionName(region.gemeente, region.province) ?? idx.regionCode,
              regionCode: idx.regionCode,
              asOfPeriod: idx.asOfPeriod,
              seriesStartYear: startYear,
              clamped: buyYear < startYear,
            };
          }
        }
      }
    }

    // Tier 2 — national (any country, incl. NL if the address didn't resolve).
    const iso2 = countryNameToCode(country);
    if (iso2) {
      const nat = await getNationalIndex(iso2);
      if (nat && nat.length > 0) {
        const est = estimateValue(opts.buyPrice, buyYear, nat);
        if (est != null) {
          const startYear = normalizeIndex(nat)[0].year;
          return {
            available: true,
            currentEstimate: Math.round(est),
            regionName: countryDisplayName(iso2),
            regionCode: iso2,
            asOfPeriod: String(nat[nat.length - 1]?.year ?? ""),
            seriesStartYear: startYear,
            clamped: buyYear < startYear,
          };
        }
      }
    }

    return UNAVAILABLE;
  } catch {
    return UNAVAILABLE;
  }
}

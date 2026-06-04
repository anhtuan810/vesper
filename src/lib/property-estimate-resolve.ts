// Orchestrates the prompt-1 estimate engine for the chat add flow: address →
// region → CBS PBK index → deterministic indicative current value. Pure
// consumption of the engine/CBS client (does not modify them). Server-side only;
// every failure returns { available: false } — never throws. NO LLM.

import { resolveRegion } from "@/lib/property-region";
import { getRegionIndex, targetRegionName } from "@/lib/cbs-pbk";
import { estimateValue, parseBuyYear, clampBuyYear } from "@/lib/property-estimate";

export interface PropertyEstimate {
  available: boolean;
  currentEstimate?: number; // rounded, in the property's native currency
  regionName?: string;
  regionCode?: string;
  asOfPeriod?: string;
  clamped?: boolean; // buy date predated the 1995 index start
}

const UNAVAILABLE: PropertyEstimate = { available: false };

function isNL(country: string | null | undefined): boolean {
  const c = (country || "").trim().toUpperCase();
  return c === "NL" || c === "NLD" || c === "NETHERLANDS" || c === "THE NETHERLANDS";
}

// Indicative current value = buyPrice × (index_latest / index_buyYear), with the
// region resolved from the address. NL real estate with a logged purchase only.
export async function estimatePropertyValue(opts: {
  address: string | null;
  country: string | null;
  buyPrice: number | null;
  buyDate: string | null;
}): Promise<PropertyEstimate> {
  try {
    if (!isNL(opts.country)) return UNAVAILABLE;
    if (!opts.buyPrice || opts.buyPrice <= 0) return UNAVAILABLE;
    const buyYear = parseBuyYear(opts.buyDate);
    if (buyYear == null) return UNAVAILABLE;
    if (!opts.address) return UNAVAILABLE;

    const region = await resolveRegion(opts.address);
    if (!region) return UNAVAILABLE;

    const idx = await getRegionIndex(region.gemeente, region.province);
    if (!idx || idx.points.length === 0) return UNAVAILABLE;

    const est = estimateValue(opts.buyPrice, buyYear, idx.points);
    if (est == null) return UNAVAILABLE;

    return {
      available: true,
      currentEstimate: Math.round(est),
      regionName: targetRegionName(region.gemeente, region.province) ?? idx.regionCode,
      regionCode: idx.regionCode,
      asOfPeriod: idx.asOfPeriod,
      clamped: clampBuyYear(buyYear).clamped,
    };
  } catch {
    return UNAVAILABLE;
  }
}

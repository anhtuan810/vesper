// Pure cost-basis / current-value separation for tradeable edits.
//
// A cost-basis or historical-price update sets buy_price (+ buy_date) ONLY. The
// position's current value and units are NEVER touched — current value is always
// units × current market price. This is the deterministic guard against the
// historical-cost corruption (a basis edit collapsing value to the buy cost).

const TRADEABLE_TYPES = new Set(["stocks", "etf", "crypto", "gold"]);

export interface BasisEditChange {
  value?: number;
  units?: number | null;
  value_delta?: number;
  buy_price?: number | null;
  buy_date?: string | null;
}

export interface BasisEditExisting {
  type: string;
  symbol?: string | null;
  units?: number | null;
}

/**
 * True when an edit is a pure cost-basis/date update on a held tradeable: it
 * carries a buy_date and/or buy_price but no unit CHANGE and no value_delta. Such
 * an edit must not move the holding's size or current value.
 *
 * A units value that merely RESTATES the current holding's count (e.g. an
 * acquisition-date fill that echoes the size it read back) is NOT a unit change,
 * so it must still be treated as cost-basis-only — otherwise the buy_date it
 * carries is silently dropped (the units branch and the !editChangesUnits guards
 * downstream would misread the same-count echo as a "buy more"). Only a count
 * that actually differs from the existing holding is a real re-acquisition.
 */
export function isCostBasisOnlyEdit(change: BasisEditChange, existing: BasisEditExisting): boolean {
  const isTradeable = TRADEABLE_TYPES.has(existing.type);
  const hasValueDelta = typeof change.value_delta === "number" && change.value_delta !== 0;
  const editChangesUnits = typeof change.units === "number" && change.units !== (existing.units ?? null);
  const hasBasis = change.buy_date != null || (typeof change.buy_price === "number" && change.buy_price > 0);
  return isTradeable && !!existing.symbol && !hasValueDelta && !editChangesUnits && hasBasis;
}

/**
 * Normalise a cost-basis-only edit in place: record buy_price (from the stated
 * price, else the historical price at buy_date) and keep buy_date, but strip any
 * value/units so the commit can never overwrite the position's current market
 * value or re-derive its size. `historicalPrice` is the native, normalised close
 * at buy_date (or null when unknown / not fetched).
 */
export function applyCostBasisOnly(change: BasisEditChange, historicalPrice: number | null): void {
  if ((change.buy_price == null || change.buy_price <= 0) && historicalPrice != null && historicalPrice > 0) {
    change.buy_price = Math.round(historicalPrice * 100) / 100;
  }
  // Current value and units are owned by the market, never by a basis update.
  delete change.value;
  delete change.units;
}

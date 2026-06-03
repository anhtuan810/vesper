// Single source of truth for turning a stored holding into its live-priced form:
// a tradeable with a symbol + units is valued at livePrice × units in the price's
// native currency. Pure — no I/O. Used by the dashboard hook (client) and the
// scenario baseline (server), so the two can never drift on the arithmetic.

export interface LivePrice {
  price: number;
  previousClose?: number;
  nativePrice?: number;
  nativeCurrency: string;
}

/**
 * Apply a live price to one holding, matching the dashboard exactly:
 * value = round(price × units), currency = the price's native currency.
 * Holdings without a symbol+units, or without a price, are returned unchanged.
 */
export function applyLivePrice<T extends { symbol?: string | null; units?: number | null; value: number; currency: string }>(
  asset: T,
  price: LivePrice | undefined,
): T {
  if (price && asset.symbol && asset.units) {
    return {
      ...asset,
      value: Math.round(price.price * asset.units),
      currency: price.nativeCurrency,
      livePrice: price.price,
      livePrev: price.previousClose,
      nativePrice: price.nativePrice,
      nativeCurrency: price.nativeCurrency,
    };
  }
  return asset;
}

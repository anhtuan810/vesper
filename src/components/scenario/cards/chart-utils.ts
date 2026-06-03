// Shared pure helpers for the scenario chart cards. Extracted verbatim from the
// (previously duplicated) ProjectionChart / CounterfactualChart / GrowthChart —
// identical behaviour, single source.

/** Round up to a tidy axis maximum. */
export function niceCeil(v: number): number {
  if (v <= 0) return 0;
  const step = v < 10_000 ? 1_000 : v < 100_000 ? 5_000 : v < 1_000_000 ? 25_000 : v < 10_000_000 ? 100_000 : 1_000_000;
  return Math.ceil(v / step) * step;
}

/** Compact money label for axis ticks, e.g. "€1.2M", "€840K", "€512". */
export function compactMoney(n: number, symbol: string): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${symbol}${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${symbol}${Math.round(a / 1_000)}K`;
  return `${symbol}${Math.round(a)}`;
}

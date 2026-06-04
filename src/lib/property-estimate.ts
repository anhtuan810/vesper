// Pure, deterministic property-value estimate from a logged purchase and the CBS
// PBK index. NO I/O, NO LLM — arithmetic only. The index series is supplied by
// the caller (cbs-pbk.ts); these functions never fetch.

export const INDEX_START_YEAR = 1995; // CBS PBK series begins 1995 Q1.

export interface IndexPoint {
  year: number;
  index: number; // PBK index value (base 2020 = 100)
}

export interface EstimateSeriesPoint {
  year: number;
  value: number;
}

// Index series may be supplied as a point array or a year→index record.
export type IndexInput = IndexPoint[] | Record<string | number, number>;

// Parse a buy date ("2014", "2014-03-01", 2014) into a year. Null if unusable.
export function parseBuyYear(buyDate: string | number | null | undefined): number | null {
  if (buyDate == null) return null;
  const y = typeof buyDate === "number" ? Math.trunc(buyDate) : parseInt(String(buyDate).slice(0, 4), 10);
  return Number.isFinite(y) && y > 1800 && y < 3000 ? y : null;
}

// Normalise an index input to a sorted, valid, positive-index point list.
export function normalizeIndex(index: IndexInput): IndexPoint[] {
  const raw: IndexPoint[] = Array.isArray(index)
    ? index.map((p) => ({ year: Number(p.year), index: Number(p.index) }))
    : Object.entries(index).map(([y, i]) => ({ year: Number(y), index: Number(i) }));
  return raw
    .filter((p) => Number.isFinite(p.year) && Number.isFinite(p.index) && p.index > 0)
    .sort((a, b) => a.year - b.year);
}

// Clamp a buy year to the index start (PBK begins 1995). Reports whether it clamped.
export function clampBuyYear(year: number): { year: number; clamped: boolean } {
  return year < INDEX_START_YEAR ? { year: INDEX_START_YEAR, clamped: true } : { year, clamped: false };
}

// Index at a year — exact match, else the nearest available year.
function indexAt(points: IndexPoint[], year: number): number | null {
  if (points.length === 0) return null;
  let best = points[0];
  let bestDiff = Math.abs(points[0].year - year);
  for (const p of points) {
    const d = Math.abs(p.year - year);
    if (d < bestDiff) {
      best = p;
      bestDiff = d;
    }
  }
  return best.index > 0 ? best.index : null;
}

// The effective buy year used against a given series: clamped to the PBK start and
// to the earliest year actually present in the series.
function effectiveBuyYear(points: IndexPoint[], buyYear: number): number {
  return Math.max(clampBuyYear(buyYear).year, points[0].year);
}

// buyPrice × (index_latest / index_buyYear). Null if inputs are unusable.
export function estimateValue(
  buyPrice: number,
  buyDate: string | number,
  index: IndexInput,
): number | null {
  if (!Number.isFinite(buyPrice) || buyPrice <= 0) return null;
  const points = normalizeIndex(index);
  if (points.length === 0) return null;
  const by = parseBuyYear(buyDate);
  if (by == null) return null;
  const ib = indexAt(points, effectiveBuyYear(points, by));
  const il = points[points.length - 1].index;
  if (ib == null || ib <= 0) return null;
  return buyPrice * (il / ib);
}

// One point per available index year from the (clamped) buy year to latest:
// buyPrice × (index_year / index_buyYear). Non-decreasing when the index is.
export function estimateSeries(
  buyPrice: number,
  buyDate: string | number,
  index: IndexInput,
): EstimateSeriesPoint[] {
  if (!Number.isFinite(buyPrice) || buyPrice <= 0) return [];
  const points = normalizeIndex(index);
  if (points.length === 0) return [];
  const by = parseBuyYear(buyDate);
  if (by == null) return [];
  const start = effectiveBuyYear(points, by);
  const ib = indexAt(points, start);
  if (ib == null || ib <= 0) return [];
  return points
    .filter((p) => p.year >= start)
    .map((p) => ({ year: p.year, value: buyPrice * (p.index / ib) }));
}

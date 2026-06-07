// Deterministic modeled-history reconstruction. NO LLM, NO interpolation —
// every figure is either a real historical close/index/FX rate, or a value the
// user actually stated held flat. Output is consumed only for charting; it is
// never persisted to the live `snapshots` table (that stays the live-only
// source of truth — see snapshot.ts / backfillSnapshots).
//
// Per-asset-type reconstruction:
//   - Tradeable (stocks/etf/crypto/gold) with a symbol: units held constant at
//     the CURRENT count, multiplied by the real historical close for each
//     month and converted at the real historical USD rate for that month. This
//     is the "assumes holdings held since {date}" assumption the chart labels.
//   - Real estate with a logged purchase + resolvable NL region: buy_price
//     scaled by the real CBS index ratio for that year (mirrors
//     estimateValue's buyPrice × index_year/index_buyYear), equity-adjusted by
//     the same amortisation model snapshot.ts uses for the live figure.
//   - Everything else with an acquisition date (cash, pension, manual,
//     collectible, or a tradeable/property lacking a price source): held FLAT
//     at its current stated value from its acquisition month — no slope is
//     fabricated for assets we have no real trajectory for.
//   - No acquisition date at all: excluded from the modeled segment entirely
//     (we don't know when it started, so any reconstruction would be a guess).

import { computeCurrentBalance, type MortgageAssetInput } from "@/lib/mortgage";
import { normalizeCryptoSymbol } from "@/lib/symbol-aliases";
import { resolveRegion } from "@/lib/property-region";
import { getRegionIndex } from "@/lib/cbs-pbk";
import { parseBuyYear, clampBuyYear, normalizeIndex, type IndexPoint } from "@/lib/property-estimate";
import { getUsdRates } from "@/lib/fx";
import { getMonthlyCloseSeries, getMonthlyFxRates } from "@/lib/historical-cache";

const TRADEABLE_TYPES = new Set(["stocks", "etf", "crypto", "gold"]);

export interface ModeledAssetInput extends MortgageAssetInput {
  id: string;
  type: string;
  value: number;
  currency: string | null;
  symbol: string | null;
  units: number | null;
  buy_price: number | null;
  buy_date: string | null; // acquisition date, month-precision ISO (YYYY-MM-01) or full ISO day
  country: string | null;
  address: string | null;
}

export interface ModeledPoint {
  date: string; // YYYY-MM-01, USD total
  total_value: number;
}

export interface ModeledHistoryResult {
  points: ModeledPoint[];
  earliestDate: string | null; // first month with any modeled contribution; null when no asset has a date
}

const EMPTY: ModeledHistoryResult = { points: [], earliestDate: null };

function monthStart(dateStr: string): string {
  return dateStr.slice(0, 7) + "-01";
}

// Inclusive [from, to) month list, each YYYY-MM-01.
function monthsInRange(from: string, toExclusive: string): string[] {
  const out: string[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = toExclusive.split("-").map(Number);
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m < tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function indexAtYear(points: IndexPoint[], year: number): number | null {
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

function isNL(country: string | null | undefined): boolean {
  const c = (country || "").trim().toUpperCase();
  return c === "NL" || c === "NLD" || c === "NETHERLANDS" || c === "THE NETHERLANDS";
}

interface MonthlyContribution {
  // months → native-currency amount, plus the currency to convert from
  amounts: Map<string, number>;
  currency: string;
  // true → convert each month at the REAL historical USD rate for that month;
  // false → convert once at the current rate (flat values carry no FX slope)
  useHistoricalFx: boolean;
}

async function reconstructTradeable(
  asset: ModeledAssetInput,
  months: string[],
): Promise<MonthlyContribution | null> {
  if (!asset.symbol || !(asset.units && asset.units > 0)) return null;
  const lookupSymbol = normalizeCryptoSymbol(asset.symbol, asset.type);
  const closes = await getMonthlyCloseSeries(lookupSymbol, months);
  if (closes.size === 0) return null;

  const amounts = new Map<string, number>();
  let currency = "USD";
  for (const month of months) {
    const close = closes.get(month);
    if (!close) continue;
    currency = close.currency;
    amounts.set(month, close.price * (asset.units as number));
  }
  if (amounts.size === 0) return null;
  return { amounts, currency, useHistoricalFx: true };
}

async function reconstructRealEstate(
  asset: ModeledAssetInput,
  months: string[],
): Promise<MonthlyContribution | null> {
  if (!isNL(asset.country) || !asset.buy_price || asset.buy_price <= 0 || !asset.address) return null;
  const buyYear = parseBuyYear(asset.buy_date);
  if (buyYear == null) return null;

  const region = await resolveRegion(asset.address);
  if (!region) return null;
  const idx = await getRegionIndex(region.gemeente, region.province);
  if (!idx || idx.points.length === 0) return null;

  const points = normalizeIndex(idx.points);
  const startYear = Math.max(clampBuyYear(buyYear).year, points[0].year);
  const indexAtBuy = indexAtYear(points, startYear);
  if (indexAtBuy == null || indexAtBuy <= 0) return null;

  const amounts = new Map<string, number>();
  for (const month of months) {
    const year = Number(month.slice(0, 4));
    const ratioIndex = indexAtYear(points, year);
    if (ratioIndex == null) continue;
    const grossValue = (asset.buy_price as number) * (ratioIndex / indexAtBuy);
    const asOf = new Date(month + "T12:00:00Z");
    const equity = grossValue - computeCurrentBalance(asset, asOf);
    amounts.set(month, equity);
  }
  if (amounts.size === 0) return null;
  return { amounts, currency: asset.currency || "USD", useHistoricalFx: false };
}

function reconstructFlat(asset: ModeledAssetInput, months: string[]): MonthlyContribution | null {
  const amounts = new Map<string, number>();
  for (const month of months) amounts.set(month, asset.value);
  if (amounts.size === 0) return null;
  return { amounts, currency: asset.currency || "USD", useHistoricalFx: false };
}

// Builds a monthly modeled net-worth series (USD) spanning from the earliest
// stated acquisition date up to (but excluding) `endDateExclusive` — typically
// the date of the first live snapshot. Returns an empty result (no modeled
// segment) when no asset carries an acquisition date — the caller then falls
// back to the existing "track from today" marker behavior.
export async function buildModeledHistory(
  assets: ModeledAssetInput[],
  endDateExclusive: string,
): Promise<ModeledHistoryResult> {
  const dated = assets
    .filter((a) => typeof a.buy_date === "string" && a.buy_date && monthStart(a.buy_date) < endDateExclusive)
    .map((a) => ({ asset: a, acquiredMonth: monthStart(a.buy_date as string) }));
  if (dated.length === 0) return EMPTY;

  const earliestDate = dated.reduce(
    (min, d) => (d.acquiredMonth < min ? d.acquiredMonth : min),
    dated[0].acquiredMonth,
  );
  const allMonths = monthsInRange(earliestDate, endDateExclusive);
  if (allMonths.length === 0) return EMPTY;

  const contributions: MonthlyContribution[] = [];
  const neededCurrencies = new Set<string>();
  const neededHistoricalMonths = new Set<string>();

  for (const { asset, acquiredMonth } of dated) {
    const months = allMonths.filter((m) => m >= acquiredMonth);
    if (months.length === 0) continue;

    let contribution: MonthlyContribution | null = null;
    if (TRADEABLE_TYPES.has(asset.type) && asset.symbol) {
      contribution = await reconstructTradeable(asset, months);
    } else if (asset.type === "real_estate") {
      contribution = await reconstructRealEstate(asset, months);
    }
    if (!contribution) contribution = reconstructFlat(asset, months);
    if (!contribution) continue;

    contributions.push(contribution);
    const cur = contribution.currency === "GBp" ? "GBP" : contribution.currency;
    if (cur !== "USD") {
      neededCurrencies.add(cur);
      if (contribution.useHistoricalFx) {
        for (const m of contribution.amounts.keys()) neededHistoricalMonths.add(m);
      }
    }
  }
  if (contributions.length === 0) return EMPTY;

  // Real historical FX for currencies that slope month-to-month (tradeables);
  // a single current-rate snapshot for currencies whose contributions are flat
  // (no slope to convert — converting at today's rate doesn't fabricate one).
  const historicalMonths = [...neededHistoricalMonths].sort();
  const historicalFx = new Map<string, Map<string, number>>();
  await Promise.all(
    [...neededCurrencies].map(async (cur) => {
      historicalFx.set(cur, await getMonthlyFxRates(cur, historicalMonths));
    }),
  );
  const currentFx = await getUsdRates();

  const totals = new Map<string, number>();
  for (const c of contributions) {
    const cur = c.currency === "GBp" ? "GBP" : c.currency;
    for (const [month, amount] of c.amounts) {
      let usd: number;
      if (cur === "USD") {
        usd = amount;
      } else if (c.useHistoricalFx) {
        const rate = historicalFx.get(cur)?.get(month);
        if (rate == null || rate <= 0) continue;
        usd = amount / rate;
      } else {
        const rate = currentFx[cur];
        if (!rate || rate <= 0) continue;
        usd = amount / rate;
      }
      totals.set(month, (totals.get(month) ?? 0) + usd);
    }
  }

  const points: ModeledPoint[] = allMonths
    .filter((m) => totals.has(m))
    .map((m) => ({ date: m, total_value: Math.round(totals.get(m)!) }));

  return { points, earliestDate: points.length > 0 ? points[0].date : null };
}

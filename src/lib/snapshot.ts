import * as Sentry from "@sentry/nextjs";
import { createServerSupabase } from "@/lib/supabase";
import { computeCurrentBalance } from "@/lib/mortgage";
import { normalizePrice } from "@/lib/prices";
import { getUsdRates, getHistoricalUsdRates, type FxSeries } from "@/lib/fx";
import { YAHOO_FINANCE_BASE_URL } from "@/lib/constants";
import { resolveRegion } from "@/lib/property-region";
import { getRegionIndex } from "@/lib/cbs-pbk";
import { parseBuyYear, clampBuyYear, normalizeIndex, type IndexPoint } from "@/lib/property-estimate";

// TODO: live-price snapshots — tradeable asset values here are DB-stored, not real-time.
// Consider fetching live prices for each tradeable asset before writing the snapshot.
export async function writeSnapshot(userId: string): Promise<void> {
  try {
    const supabase = createServerSupabase();

    const { data: assets, error } = await supabase
      .from("assets")
      .select("type, value, currency, mortgage_balance, mortgage_balance_recorded_at, mortgage_rate, monthly_payment, mortgage_type")
      .eq("user_id", userId);

    if (error) throw error;
    if (!assets || assets.length === 0) return;

    const fx = await getUsdRates();
    const toUsd = (amount: number, currency: string) => {
      if (currency === "USD") return amount;
      const rate = fx[currency];
      return rate ? amount / rate : amount;
    };

    const now = new Date();
    const netTotal = assets.reduce((sum, a) => {
      const cur = (a.currency as string | null) || "USD";
      const equity = a.type === "real_estate"
        ? (a.value as number) - computeCurrentBalance(a, now)
        : (a.value as number);
      return sum + toUsd(equity, cur);
    }, 0);

    const breakdown: Record<string, number> = {};
    for (const a of assets) {
      const cur = (a.currency as string | null) || "USD";
      const equity = a.type === "real_estate"
        ? (a.value as number) - computeCurrentBalance(a, now)
        : (a.value as number);
      breakdown[a.type as string] = (breakdown[a.type as string] ?? 0) + toUsd(equity, cur);
    }

    const today = new Date().toISOString().slice(0, 10);

    const { error: upsertError } = await supabase.from("snapshots").upsert(
      { user_id: userId, total_value: netTotal, breakdown, date: today },
      { onConflict: "user_id,date" }
    );

    if (upsertError) throw upsertError;
  } catch (err) {
    Sentry.captureException(err, {
      tags: { fn: "writeSnapshot" },
      extra: { user_id: userId },
    });
  }
}

// ── Backfill helpers ───────────────────────────────────────────────────────────

const TRADEABLE = new Set(["stocks", "etf", "crypto", "gold"]);

// Fetches a full daily closing-price series from Yahoo Finance for a date range.
// Returns prices sorted ascending by date.
async function fetchFullPriceHistory(
  symbol: string,
  startDate: string,
  endDate: string,
): Promise<Array<{ date: string; price: number; currency: string }> | null> {
  try {
    const period1 = Math.floor(new Date(startDate + "T00:00:00Z").getTime() / 1000);
    const period2 = Math.floor(new Date(endDate + "T23:59:59Z").getTime() / 1000);
    const url = `${YAHOO_FINANCE_BASE_URL}/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const currency: string = result.meta?.currency ?? "USD";
    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

    const history: Array<{ date: string; price: number; currency: string }> = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] == null) continue;
      history.push({
        date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
        price: closes[i]!,
        currency,
      });
    }
    history.sort((a, b) => a.date.localeCompare(b.date));
    return history;
  } catch {
    return null;
  }
}

// Returns the most recent price on or before `date`, walking a sorted-ascending history.
function priceAtOrBefore(
  history: Array<{ date: string; price: number; currency: string }>,
  date: string,
): { price: number; currency: string } | null {
  let result: { price: number; currency: string } | null = null;
  for (const entry of history) {
    if (entry.date > date) break;
    result = { price: entry.price, currency: entry.currency };
  }
  return result;
}

// Most recent real historical USD rate at or before `date` for `currency`,
// walking the Frankfurter time-series (which has gaps on weekends/holidays).
// Falls back to the current-day rate when the series has no entry at/before
// the date or doesn't cover the currency at all.
function historicalFxRate(
  series: FxSeries,
  sortedDates: string[],
  date: string,
  currency: string,
  currentFx: Record<string, number>,
): number | null {
  if (currency === "USD") return 1;
  let result: number | null = null;
  for (const d of sortedDates) {
    if (d > date) break;
    const rate = series[d]?.[currency];
    if (rate != null) result = rate;
  }
  return result ?? currentFx[currency] ?? null;
}

function isNL(country: string | null | undefined): boolean {
  const c = (country || "").trim().toUpperCase();
  return c === "NL" || c === "NLD" || c === "NETHERLANDS" || c === "THE NETHERLANDS";
}

// Nearest CBS index point to `year` — mirrors property-estimate's own
// nearest-year matching so the backfill agrees with the live estimate.
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

// Returns units held as of `date` by walking a sorted-ascending mutation timeline.
// Returns 0 if no mutation precedes the date.
function unitsAtDate(
  timeline: Array<{ date: string; units: number }>,
  date: string,
): number {
  let units = 0;
  for (const entry of timeline) {
    if (entry.date > date) break;
    units = entry.units;
  }
  return units;
}

// Generates snapshot target dates with decreasing resolution going further back:
//   - daily:   D-1 … D-30
//   - weekly:  every 7 days from D-30 back to D-365
//   - monthly: 1st of each month from D-365 back to `earliest`
// Returns dates sorted ascending that are >= earliest and < todayStr.
function targetSnapshotDates(earliest: string, todayStr: string): string[] {
  const set = new Set<string>();
  const today = new Date(todayStr + "T12:00:00Z");

  // Daily
  for (let i = 1; i <= 30; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    set.add(d.toISOString().slice(0, 10));
  }

  // Weekly: D-30 back to D-365
  const weeklyEnd = new Date(today);
  weeklyEnd.setUTCDate(weeklyEnd.getUTCDate() - 30);
  const monthlyStart = new Date(today);
  monthlyStart.setUTCFullYear(monthlyStart.getUTCFullYear() - 1);
  let w = new Date(weeklyEnd);
  while (w > monthlyStart) {
    set.add(w.toISOString().slice(0, 10));
    w.setUTCDate(w.getUTCDate() - 7);
  }

  // Monthly: 1st of each month from 1 year ago back to earliest
  const earliestDate = new Date(earliest + "T12:00:00Z");
  let m = new Date(monthlyStart);
  m.setUTCDate(1);
  while (m >= earliestDate) {
    set.add(m.toISOString().slice(0, 10));
    m.setUTCMonth(m.getUTCMonth() - 1);
  }

  return [...set]
    .filter((d) => d >= earliest && d < todayStr)
    .sort();
}

// Backfills historical net-worth snapshots using actual units held at each date.
// Normally only writes rows that don't already exist (ignoreDuplicates: true) —
// recomputing every existing row on every call would be wasteful and would
// fight the live cron's "today" row. But adding or removing a dated asset
// changes what EVERY historical row from that asset's acquisition date forward
// should contain, and upsert-skip would leave those rows stale (missing the
// asset entirely). When `rebuildFrom` is given, every snapshot row — backfilled
// or daily-cron alike — with `date >= rebuildFrom` (today's row excluded; the
// live cron owns it) is deleted and recomputed from the current asset set, so
// the corrected total actually lands instead of being discarded as a duplicate.
export async function backfillSnapshots(userId: string, rebuildFrom?: string | null): Promise<void> {
  try {
    const supabase = createServerSupabase();

    // Load all assets
    const { data: assets, error: aErr } = await supabase
      .from("assets")
      .select("id, type, value, currency, symbol, created_at, buy_date, buy_price, country, address, mortgage_balance, mortgage_balance_recorded_at, mortgage_rate, monthly_payment, mortgage_type")
      .eq("user_id", userId);
    if (aErr) throw aErr;
    if (!assets || assets.length === 0) return;

    // Load all mutations (asset_id is never null for portfolio changes)
    const { data: mutations, error: mErr } = await supabase
      .from("mutations")
      .select("asset_id, action, after_units, occurred_at")
      .eq("user_id", userId)
      .not("asset_id", "is", null);
    if (mErr) throw mErr;

    // Determine earliest date from dated mutations and asset creation dates
    const datedDates = (mutations ?? [])
      .filter((m) => m.occurred_at)
      .map((m) => (m.occurred_at as string).slice(0, 10));
    const assetDates = assets.map((a) => (a.created_at as string).slice(0, 10));
    const allDates = [...datedDates, ...assetDates].filter(Boolean);
    if (allDates.length === 0) return;
    const earliest = allDates.sort()[0];

    const todayStr = new Date().toISOString().slice(0, 10);
    if (earliest >= todayStr) return;

    // Per-asset acquisition date — the "add" mutation's occurred_at (= buy_date
    // when stated). This is the basis non-tradeable types backfill flat from;
    // tradeables already key off the real unit timeline below. Falls back to
    // created_at (no fabricated acquisition date for assets that lack one).
    const acquisitionByAsset = new Map<string, string>();
    for (const m of mutations ?? []) {
      if (!m.asset_id || m.action !== "add" || !m.occurred_at) continue;
      acquisitionByAsset.set(m.asset_id as string, (m.occurred_at as string).slice(0, 10));
    }

    // NL real estate with a logged purchase + resolvable region: precompute the
    // CBS-index ratio reconstruction — buy_price scaled by index_year/index_buyYear
    // — the same basis the live estimateValue uses for the current figure.
    // Equity is index-scaled gross value minus the live
    // amortisation model's balance at each date. Anything else (no NL address,
    // no buy_price, unresolvable region/index) falls back to flat current-value
    // equity below — the prior behavior.
    const realEstateIndexes = new Map<string, { points: IndexPoint[]; indexAtBuy: number }>();
    await Promise.all(
      assets
        .filter((a) => a.type === "real_estate")
        .map(async (a) => {
          const buyPrice = a.buy_price as number | null;
          if (!isNL(a.country as string | null) || !buyPrice || buyPrice <= 0 || !a.address) return;
          const buyYear = parseBuyYear(a.buy_date as string | null);
          if (buyYear == null) return;
          const region = await resolveRegion(a.address as string);
          if (!region) return;
          const idx = await getRegionIndex(region.gemeente, region.province);
          if (!idx || idx.points.length === 0) return;
          const points = normalizeIndex(idx.points);
          const startYear = Math.max(clampBuyYear(buyYear).year, points[0].year);
          const indexAtBuy = indexAtYear(points, startYear);
          if (indexAtBuy == null || indexAtBuy <= 0) return;
          realEstateIndexes.set(a.id as string, { points, indexAtBuy });
        }),
    );

    // Build per-asset unit timeline.
    // Mutations with null occurred_at (starting positions) are placed at earliest.
    const mutsByAsset = new Map<string, Array<{ date: string; units: number }>>();
    for (const m of mutations ?? []) {
      if (!m.asset_id) continue;
      // For remove, after_units is null → 0 units; for add/edit, use after_units directly.
      const afterUnits = m.action === "remove" ? 0 : (m.after_units as number | null);
      if (afterUnits === null) continue;
      const date = m.occurred_at ? (m.occurred_at as string).slice(0, 10) : earliest;
      if (!mutsByAsset.has(m.asset_id as string)) mutsByAsset.set(m.asset_id as string, []);
      mutsByAsset.get(m.asset_id as string)!.push({ date, units: afterUnits });
    }
    for (const timeline of mutsByAsset.values()) {
      timeline.sort((a, b) => a.date.localeCompare(b.date));
    }

    // Fetch full price history once per unique tradeable symbol
    const symbols = [
      ...new Set(
        assets
          .filter((a) => TRADEABLE.has(a.type as string) && a.symbol)
          .map((a) => a.symbol as string),
      ),
    ];
    const priceHistories = new Map<string, Array<{ date: string; price: number; currency: string }>>();
    await Promise.all(
      symbols.map(async (symbol) => {
        const history = await fetchFullPriceHistory(symbol, earliest, todayStr);
        if (history && history.length > 0) priceHistories.set(symbol, history);
      }),
    );

    const fx = await getUsdRates();
    const dates = targetSnapshotDates(earliest, todayStr);
    if (dates.length === 0) return;

    // Real per-date USD rates for the whole backfill span — every contribution
    // (tradeable, real estate, flat-held alike) converts at the REAL historical
    // rate for ITS OWN date, not today's. A native-currency value still moves in
    // USD terms as real exchange rates move; freezing it at today's rate would
    // erase that movement and break reconciliation with the live snapshot path
    // (which always converts at the rate for the date it's valuing).
    const fxSeries = await getHistoricalUsdRates(earliest, todayStr);
    const fxSeriesDates = Object.keys(fxSeries).sort();
    const rateAt = (date: string, currency: string) =>
      historicalFxRate(fxSeries, fxSeriesDates, date, currency, fx);

    type SnapshotRow = { user_id: string; date: string; total_value: number; breakdown: Record<string, number> };

    // Computes a single date's row from the CURRENT asset set — the same logic
    // used for the standard backfill pass, factored out so a rebuild can also
    // recompute arbitrary pre-existing (e.g. daily-cron) dates that fall
    // outside the standard sparse `dates` set.
    const computeRow = (date: string): SnapshotRow | null => {
      const asOf = new Date(date + "T12:00:00Z");
      let total = 0;
      const breakdown: Record<string, number> = {};

      for (const asset of assets) {
        const type = asset.type as string;
        const inception = acquisitionByAsset.get(asset.id as string) ?? (asset.created_at as string).slice(0, 10);
        let contribution = 0;

        if (TRADEABLE.has(type) && asset.symbol) {
          const timeline = mutsByAsset.get(asset.id as string) ?? [];
          const units = unitsAtDate(timeline, date);
          if (units > 0) {
            const history = priceHistories.get(asset.symbol as string);
            if (history) {
              const priceEntry = priceAtOrBefore(history, date);
              if (priceEntry) {
                const raw = normalizePrice(priceEntry.price, priceEntry.currency);
                const cur = priceEntry.currency === "GBp" ? "GBP" : priceEntry.currency;
                const native = raw * units;
                const rate = rateAt(date, cur);
                contribution = cur === "USD" ? native : (rate ? native / rate : 0);
              }
            }
          }
        } else if (type === "real_estate") {
          const cur = (asset.currency as string | null) || "USD";
          const reIndex = realEstateIndexes.get(asset.id as string);
          const grossValue = reIndex
            ? (asset.buy_price as number) * ((indexAtYear(reIndex.points, Number(date.slice(0, 4))) ?? reIndex.indexAtBuy) / reIndex.indexAtBuy)
            : (asset.value as number);
          const equity = grossValue - computeCurrentBalance(asset, asOf);
          const reRate = rateAt(date, cur);
          contribution = cur === "USD" ? equity : (reRate ? equity / reRate : 0);
        } else {
          // Cash / bonds / pension / other: held flat at current value from
          // acquisition (the add mutation's occurred_at = stated buy_date) —
          // not from when the row was created in the DB.
          if (date >= inception) {
            const cur = (asset.currency as string | null) || "USD";
            const val = asset.value as number;
            const flatRate = rateAt(date, cur);
            contribution = cur === "USD" ? val : (flatRate ? val / flatRate : 0);
          }
        }

        if (contribution > 0) {
          total += contribution;
          breakdown[type] = (breakdown[type] ?? 0) + contribution;
        }
      }

      if (total > 0) {
        return { user_id: userId, date, total_value: Math.round(total), breakdown };
      }
      return null;
    };

    const rows: SnapshotRow[] = [];
    for (const date of dates) {
      const row = computeRow(date);
      if (row) rows.push(row);
    }

    if (rebuildFrom) {
      // Rebuild range is [rebuildFrom, todayStr) — today's row belongs to the
      // live cron (writeSnapshot), never touched here.
      const rebuildStart = rebuildFrom < earliest ? earliest : rebuildFrom;

      // Pre-existing rows in the rebuild range may include dates the standard
      // sparse `dates` set doesn't cover (e.g. older daily-cron rows) — those
      // need recomputing too, or they'd survive the delete... no, they'd be
      // deleted and never reinserted, silently losing granularity.
      const { data: existingSnaps, error: existErr } = await supabase
        .from("snapshots")
        .select("date")
        .eq("user_id", userId)
        .gte("date", rebuildStart)
        .lt("date", todayStr);
      if (existErr) throw existErr;

      const targetSet = new Set(dates);
      const extraRows: SnapshotRow[] = [];
      for (const s of existingSnaps ?? []) {
        const d = s.date as string;
        if (targetSet.has(d)) continue;
        const row = computeRow(d);
        if (row) extraRows.push(row);
      }

      const carryRows = rows.filter((r) => r.date < rebuildStart);
      const rebuildRows = [...rows.filter((r) => r.date >= rebuildStart), ...extraRows];

      if (carryRows.length > 0) {
        const { error } = await supabase.from("snapshots").upsert(carryRows, {
          onConflict: "user_id,date",
          ignoreDuplicates: true,
        });
        if (error) throw error;
      }

      const { error: delError } = await supabase
        .from("snapshots")
        .delete()
        .eq("user_id", userId)
        .gte("date", rebuildStart)
        .lt("date", todayStr);
      if (delError) throw delError;

      if (rebuildRows.length > 0) {
        const { error: insError } = await supabase.from("snapshots").insert(rebuildRows);
        if (insError) throw insError;
      }
      return;
    }

    if (rows.length === 0) return;

    const { error: upsertError } = await supabase.from("snapshots").upsert(rows, {
      onConflict: "user_id,date",
      ignoreDuplicates: true,
    });
    if (upsertError) throw upsertError;
  } catch (err) {
    Sentry.captureException(err, {
      tags: { fn: "backfillSnapshots" },
      extra: { user_id: userId },
    });
  }
}

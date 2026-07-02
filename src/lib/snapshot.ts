import * as Sentry from "@sentry/nextjs";
import { createServerSupabase } from "@/lib/supabase";
import { computeCurrentBalance, projectMortgage, annuityPayment, monthsBetween } from "@/lib/mortgage";
import { normalizePrice } from "@/lib/prices";
import { getUsdRates, getHistoricalUsdRates, historicalFxRate } from "@/lib/fx";
import { YAHOO_FINANCE_BASE_URL } from "@/lib/constants";
import { resolveRegion } from "@/lib/property-region";
import { getRegionIndex } from "@/lib/cbs-pbk";
import { parseBuyYear, normalizeIndex } from "@/lib/property-estimate";

export async function writeSnapshot(userId: string): Promise<void> {
  try {
    const supabase = createServerSupabase();

    const { data: assets, error } = await supabase
      .from("assets")
      .select("type, value, currency, symbol, units, mortgage_balance, mortgage_balance_recorded_at, mortgage_rate, monthly_payment, mortgage_type, buy_date, created_at")
      .eq("user_id", userId)
      .is("removed_at", null);

    if (error) throw error;
    if (!assets || assets.length === 0) return;

    const fx = await getUsdRates();
    const toUsd = (amount: number, currency: string) => {
      if (currency === "USD") return amount;
      const rate = fx[currency];
      return rate ? amount / rate : amount;
    };

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + "-01";

    // Real-estate equity is anchored to the same first-of-month date computeRow
    // uses (clamped to acquisition), so the live row matches the backfilled
    // history for the current month exactly — no curve, no `now`.
    const equityOf = (a: (typeof assets)[number]): number => {
      if (a.type !== "real_estate") return a.value as number;
      const buyDateNorm = normalizeBuyDate(a.buy_date as string | null);
      const inception = (buyDateNorm ?? (a.created_at as string)).slice(0, 10);
      const anchor = monthStart < inception ? inception : monthStart;
      const anchorDate = new Date(anchor + "T12:00:00Z");
      return Math.max(0, (a.value as number) - computeCurrentBalance(a, anchorDate));
    };

    // Tradeables are valued from the latest market close — the same source
    // backfillSnapshots's computeRow uses — rather than the DB's `value`, which
    // is only refreshed on add/edit and otherwise drifts from the market.
    const historyStart = new Date(now);
    historyStart.setUTCDate(historyStart.getUTCDate() - 10);
    const historyStartStr = historyStart.toISOString().slice(0, 10);

    const tradeableSymbols = [
      ...new Set(
        assets
          .filter((a) => TRADEABLE.has(a.type as string) && a.symbol && (a.units as number | null))
          .map((a) => a.symbol as string),
      ),
    ];
    const priceHistories = new Map<string, Array<{ date: string; price: number; currency: string }>>();
    await Promise.all(
      tradeableSymbols.map(async (symbol) => {
        const history = await fetchFullPriceHistory(symbol, historyStartStr, today);
        if (history && history.length > 0) priceHistories.set(symbol, history);
      }),
    );

    let netTotal = 0;
    const breakdown: Record<string, number> = {};
    const nativeByCur: Record<string, number> = {};
    let staleTradeableFallback = false;

    for (const a of assets) {
      let cur = (a.currency as string | null) || "USD";
      let equity: number;

      if (TRADEABLE.has(a.type as string) && a.symbol && (a.units as number | null)) {
        const priceEntry = priceAtOrBefore(priceHistories.get(a.symbol as string) ?? [], today);
        if (priceEntry) {
          equity = normalizePrice(priceEntry.price, priceEntry.currency) * (a.units as number);
          cur = priceEntry.currency === "GBp" ? "GBP" : priceEntry.currency;
        } else {
          // Market price unavailable (Yahoo down, delisted, etc.) — fall back to
          // the stored value, but flag it so the regression guard below can catch
          // a fallback that collapses the total vs. the prior snapshot.
          equity = a.value as number;
          staleTradeableFallback = true;
        }
      } else {
        equity = equityOf(a);
      }

      netTotal += toUsd(equity, cur);
      breakdown[a.type as string] = (breakdown[a.type as string] ?? 0) + toUsd(equity, cur);
      nativeByCur[cur] = (nativeByCur[cur] ?? 0) + equity;
    }
    const native_breakdown = Object.fromEntries(Object.entries(nativeByCur).map(([c, v]) => [c, Math.round(v)]));

    // Regression guard: if a held tradeable's market price couldn't be fetched
    // and the fallback to its (possibly stale/cost-basis) `value` collapses the
    // total vs. the most recent prior snapshot, skip the upsert rather than
    // overwrite a good row with a bad one — log it so it can be retried.
    if (staleTradeableFallback) {
      const { data: priorRows } = await supabase
        .from("snapshots")
        .select("total_value")
        .eq("user_id", userId)
        .lte("date", today)
        .order("date", { ascending: false })
        .limit(1);
      const reference = priorRows?.[0]?.total_value as number | undefined;
      if (reference != null && reference > 0 && netTotal < reference * 0.5) {
        Sentry.captureMessage("writeSnapshot: tradeable price fallback collapsed total vs. prior snapshot — skipped", {
          level: "warning",
          tags: { fn: "writeSnapshot" },
          extra: { user_id: userId, date: today, netTotal, reference },
        });
        return;
      }
    }

    const { error: upsertError } = await supabase.from("snapshots").upsert(
      { user_id: userId, total_value: netTotal, breakdown, native_breakdown, date: today },
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

function isNL(country: string | null | undefined): boolean {
  const c = (country || "").trim().toUpperCase();
  return c === "NL" || c === "NLD" || c === "NETHERLANDS" || c === "THE NETHERLANDS";
}

// Date string -> fractional year at month precision. "2024-07-02" -> ~2024.50.
function fractionalYear(date: string): number {
  const d = new Date(date + "T12:00:00Z");
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  return y + (d.getTime() - start) / (end - start);
}

// buy_date may be a full date, year-month, or bare year.
function normalizeBuyDate(buyDate: string | null): string | null {
  if (!buyDate) return null;
  const s = String(buyDate).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-15`;
  if (/^\d{4}$/.test(s)) return `${s}-07-01`;
  const y = parseBuyYear(s);
  return y == null ? null : `${y}-07-01`;
}

type XY = { x: number; y: number };

// Fritsch-Carlson monotone cubic interpolant. Smooth (C1), no overshoot.
// Outside [x0, xn] extends linearly along the boundary tangent.
function monotoneCubic(points: XY[]): (x: number) => number {
  const n = points.length;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m: number[] = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * d[i];
      m[i + 1] = tau * b * d[i];
    }
  }
  return (x: number): number => {
    if (x <= xs[0]) return ys[0] + m[0] * (x - xs[0]);
    if (x >= xs[n - 1]) return ys[n - 1] + m[n - 1] * (x - xs[n - 1]);
    let i = 0;
    while (i < n - 1 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1];
  };
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
//   - daily:   D-1 … D-30 (the only relative tier; recent + recomputed every run)
//   - weekly:  every MONDAY from this week back to ~1 year ago
//   - monthly: 1st of each month from this month back to `earliest`
// The weekly and monthly tiers are CALENDAR-anchored (fixed Mondays / 1sts),
// not offset from `today` — so every run targets the SAME historical dates
// regardless of which weekday it runs. That stability is what lets the upsert
// keep the whole set current instead of interleaving each run's freshly-computed
// dates between a previous run's (the cause of the sawtooth on add/remove).
// Returns dates sorted ascending that are >= earliest and < todayStr.
// Exported for verify-snapshot-dates.ts (pure; deterministic given its args).
export function targetSnapshotDates(earliest: string, todayStr: string, hasTradeables: boolean): string[] {
  const set = new Set<string>();
  const today = new Date(todayStr + "T12:00:00Z");
  const earliestDate = new Date(earliest + "T12:00:00Z");

  if (hasTradeables) {
    // Daily: last 30 days.
    for (let i = 1; i <= 30; i++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      set.add(d.toISOString().slice(0, 10));
    }

    // Weekly (Mondays): this week's Monday back to ~1 year ago.
    const oneYearAgo = new Date(today);
    oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1);
    const w = new Date(today);
    w.setUTCDate(w.getUTCDate() - ((w.getUTCDay() + 6) % 7)); // snap to Monday
    while (w > oneYearAgo) {
      set.add(w.toISOString().slice(0, 10));
      w.setUTCDate(w.getUTCDate() - 7);
    }

    // Monthly: 1st of each month from this month back to earliest.
    const m = new Date(today);
    m.setUTCDate(1);
    while (m >= earliestDate) {
      set.add(m.toISOString().slice(0, 10));
      m.setUTCMonth(m.getUTCMonth() - 1);
    }
  } else {
    // Property/cash/pension-only portfolio: monthly cadence end-to-end —
    // first of each month from today back to earliest. No daily/weekly
    // samples, since these holdings don't change value within a month.
    const m = new Date(today);
    m.setUTCDate(1);
    while (m >= earliestDate) {
      set.add(m.toISOString().slice(0, 10));
      m.setUTCMonth(m.getUTCMonth() - 1);
    }
  }

  return [...set]
    .filter((d) => d >= earliest && d < todayStr)
    .sort();
}

// Backfills historical net-worth snapshots using the actual asset set held at
// each date (units from the mutation timeline; property/cash/etc. gated by
// acquisition and sale dates). Target dates come from a CALENDAR-anchored
// lattice (see targetSnapshotDates) so every run hits the same dates.
//
// Two modes:
//   - Standard pass (no rebuildFrom): upsert the sparse lattice, OVERWRITING on
//     conflict. Idempotent and self-healing — a re-run corrects any stale row
//     rather than skipping it. today's row is excluded (the live cron owns it).
//   - Rebuild (rebuildFrom set): adding/removing/editing a dated asset changes
//     what every row from that date forward should contain. The range
//     [rebuildFrom, today) — lattice dates AND any pre-existing rows in range —
//     is recomputed and atomically replaced (delete + insert). Rows before the
//     range are left intact (older missing ones are insert-only backfilled).
//
// Both modes abort BEFORE any write if a currently-held tradeable's price
// history failed to load, so a transient market-data outage can never replace
// good rows with collapsed ones.
export async function backfillSnapshots(userId: string, rebuildFrom?: string | null): Promise<void> {
  try {
    const supabase = createServerSupabase();

    // Demo accounts: never reconstruct. Their snapshot history is hand-authored
    // (demo-seed's SNAPSHOT_ANCHORS tell the persona's five-year story); a
    // mutation-timeline reconstruction cannot reproduce it — early dates only
    // contain what the seeded timeline says existed then — so a visitor's chat
    // edit (rebuildFrom) or a stray standard pass would replace the authored
    // curve with a collapsed one. The next demo entry reseeds anyway.
    const { data: demoEnt } = await supabase
      .from("entitlements")
      .select("id")
      .eq("user_id", userId)
      .eq("product_id", "demo")
      .limit(1)
      .maybeSingle();
    if (demoEnt) return;

    // Load all assets — INCLUDING soft-deleted (removed_at set) ones, so a sold
    // position is still reconstructed as held up to its sale date. (Current-
    // holdings reads filter removed_at; historical reconstruction must not.)
    const { data: assets, error: aErr } = await supabase
      .from("assets")
      .select("id, type, value, currency, symbol, created_at, removed_at, buy_date, buy_price, country, address, mortgage_balance, mortgage_balance_recorded_at, mortgage_rate, monthly_payment, mortgage_type, mortgage_start_date, mortgage_end_date")
      .eq("user_id", userId);
    if (aErr) throw aErr;
    if (!assets || assets.length === 0) return;

    // Load all mutations (asset_id stays set for soft-deletes; a hard-deleted
    // "mistake" asset's mutations are deleted with it, so it's invisible here —
    // exactly the intent). recorded_at tie-breaks same-day mutations so the
    // unit timeline is deterministic regardless of DB row order.
    const { data: mutations, error: mErr } = await supabase
      .from("mutations")
      .select("asset_id, action, after_units, occurred_at, recorded_at")
      .eq("user_id", userId)
      .not("asset_id", "is", null);
    if (mErr) throw mErr;

    // Per-asset removal date: the sale recorded by a remove mutation (occurred_at),
    // falling back to the asset's removed_at marker. Non-tradeable types (which
    // have no unit timeline) read this to STOP contributing after the sale;
    // tradeables already stop via their remove mutation zeroing units.
    const removalByAsset = new Map<string, string>();
    for (const m of mutations ?? []) {
      if (m.asset_id && m.action === "remove" && m.occurred_at) {
        const d = (m.occurred_at as string).slice(0, 10);
        const prev = removalByAsset.get(m.asset_id as string);
        if (!prev || d < prev) removalByAsset.set(m.asset_id as string, d);
      }
    }
    for (const a of assets) {
      if (a.removed_at && !removalByAsset.has(a.id as string)) {
        removalByAsset.set(a.id as string, (a.removed_at as string).slice(0, 10));
      }
    }

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

    // Per real-estate asset: build a progress sampler tAt(date) -> fraction of
    // the buy->current move reached by that date. CBS supplies shape only; the
    // two anchors (buy_price at buy_date, current value at today) are honored by
    // construction. Falls back to linear-in-time when CBS is unavailable/flat.
    const realEstateT = new Map<string, (date: string) => number>();
    const todayFy = fractionalYear(todayStr);
    await Promise.all(
      assets
        .filter((a) => a.type === "real_estate")
        .map(async (a) => {
          const buyPrice = a.buy_price as number | null;
          const buyDateNorm = normalizeBuyDate(a.buy_date as string | null);
          if (!buyPrice || buyPrice <= 0 || !buyDateNorm) return;
          const buyFy = fractionalYear(buyDateNorm);
          if (todayFy <= buyFy) return;

          const linearT = (date: string) => (fractionalYear(date) - buyFy) / (todayFy - buyFy);

          let shapeT: ((date: string) => number) | null = null;
          if (isNL(a.country as string | null) && a.address) {
            const region = await resolveRegion(a.address as string);
            if (region) {
              const idx = await getRegionIndex(region.gemeente, region.province);
              if (idx && idx.points.length >= 2) {
                const cps: XY[] = normalizeIndex(idx.points).map((p) => ({ x: p.year + 0.5, y: p.index }));
                if (cps.length >= 2) {
                  const S = monotoneCubic(cps);
                  const sBuy = S(buyFy);
                  const denom = S(todayFy) - sBuy;
                  if (Math.abs(denom) > 1e-9) {
                    shapeT = (date: string) => (S(fractionalYear(date)) - sBuy) / denom;
                  }
                }
              }
            }
          }
          realEstateT.set(a.id as string, shapeT ?? linearT);
        }),
    );

    // Per real-estate asset: build a historical balance sampler from projectMortgage.
    // Uses the same schedule the MortgageBlock card uses so the today value matches.
    // Falls back to computeCurrentBalance in computeRow when no usable schedule.
    const realEstateBalanceAt = new Map<string, (date: string) => number>();
    const todayDate = new Date(todayStr + "T12:00:00Z");
    for (const a of assets.filter((x) => x.type === "real_estate")) {
      const currentBalance = computeCurrentBalance(a, todayDate);
      if (currentBalance <= 0) continue;
      const rate = a.mortgage_rate as number | null;
      const type = (a.mortgage_type as string | null) ?? "annuity";
      const startStr = (a.mortgage_start_date as string | null) ?? (a.buy_date as string | null);
      const endStr = a.mortgage_end_date as string | null;
      if (!startStr || rate == null) continue;
      let pmt = a.monthly_payment as number | null;
      const startDate = new Date(startStr);
      const endDate = endStr ? new Date(endStr) : undefined;
      if (pmt == null && type !== "interest_only" && endDate) {
        const rem = monthsBetween(todayDate, endDate);
        if (rem > 0) pmt = annuityPayment(currentBalance, rate, rem);
      }
      if (pmt == null && type !== "interest_only") continue;
      const proj = projectMortgage(currentBalance, rate, pmt ?? 0, type as "annuity" | "linear" | "interest_only", startDate, todayDate, endDate);
      if (proj.status !== "ok" || proj.balanceCurve.length < 2) continue;
      const curve = proj.balanceCurve;
      const startFy = fractionalYear(startStr.slice(0, 10));
      const balAt = (date: string): number => {
        const k = (fractionalYear(date) - startFy) * 12;
        if (k <= 0) return curve[0].balance;
        const i = Math.floor(k);
        if (i >= curve.length - 1) return curve[curve.length - 1].balance;
        const frac = k - i;
        return curve[i].balance + frac * (curve[i + 1].balance - curve[i].balance);
      };
      realEstateBalanceAt.set(a.id as string, balAt);
    }

    // Build per-asset unit timeline.
    // Mutations with null occurred_at (starting positions) are placed at earliest.
    const mutsByAsset = new Map<string, Array<{ date: string; units: number; seq: string }>>();
    for (const m of mutations ?? []) {
      if (!m.asset_id) continue;
      // For remove, after_units is null → 0 units; for add/edit, use after_units directly.
      const afterUnits = m.action === "remove" ? 0 : (m.after_units as number | null);
      if (afterUnits === null) continue;
      const date = m.occurred_at ? (m.occurred_at as string).slice(0, 10) : earliest;
      const seq = (m.recorded_at as string | null) ?? "";
      if (!mutsByAsset.has(m.asset_id as string)) mutsByAsset.set(m.asset_id as string, []);
      mutsByAsset.get(m.asset_id as string)!.push({ date, units: afterUnits, seq });
    }
    for (const timeline of mutsByAsset.values()) {
      // Sort by event date, then recorded_at — so two mutations on the same day
      // (e.g. an add then a same-day edit) apply in the order they were recorded,
      // not in arbitrary DB row order.
      timeline.sort((a, b) => a.date.localeCompare(b.date) || a.seq.localeCompare(b.seq));
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

    // Non-destructive guard: if a CURRENTLY-HELD tradeable's price history failed
    // to load (Yahoo down, rate-limited, transient), every row containing it
    // would collapse to ~0. The rebuild path DELETEs before reinserting, so a bad
    // pass would replace good rows with corrupt ones. Abort before touching the
    // table and let a later run retry — a stale-but-correct chart beats a freshly
    // corrupted one. (Sold/removed symbols are exempt: a delisted disposal may
    // legitimately no longer fetch, and it only contributes pre-sale.)
    const heldSymbols = new Set(
      assets
        .filter((a) => TRADEABLE.has(a.type as string) && a.symbol && a.removed_at == null)
        .map((a) => a.symbol as string),
    );
    const missingHeld = [...heldSymbols].filter((s) => !priceHistories.has(s));
    if (missingHeld.length > 0) {
      Sentry.captureMessage("backfillSnapshots: aborting — missing price history for held symbols", {
        level: "warning",
        tags: { fn: "backfillSnapshots" },
        extra: { user_id: userId, missingHeld, rebuildFrom: rebuildFrom ?? null },
      });
      return;
    }

    const fx = await getUsdRates();
    const hasTradeables = assets.some((a) => TRADEABLE.has(a.type as string));
    const dates = targetSnapshotDates(earliest, todayStr, hasTradeables);
    if (dates.length === 0) return;

    // Real per-date USD rates for the whole backfill span — every contribution
    // (tradeable, real estate, flat-held alike) converts at the REAL historical
    // rate for ITS OWN date, not today's. A native-currency value still moves in
    // USD terms as real exchange rates move; freezing it at today's rate would
    // erase that movement and break reconciliation with the live snapshot path
    // (which always converts at the rate for the date it's valuing).
    const fxSeries = await getHistoricalUsdRates(earliest, todayStr);
    const fxSeriesDates = Object.keys(fxSeries).sort();
    // Gap-fill on top of historicalFxRate's prior-date carry-forward + live
    // fallback: if a date falls before the first available historical entry
    // (and there's no live rate either), fall forward to the nearest LATER
    // date in the series. Only an entirely-empty series (and no live rate)
    // yields null.
    const rateAt = (date: string, currency: string): number | null => {
      const r = historicalFxRate(fxSeries, fxSeriesDates, date, currency, fx);
      if (r != null) return r;
      for (const d of fxSeriesDates) {
        if (d < date) continue;
        const rate = fxSeries[d]?.[currency];
        if (rate != null) return rate;
      }
      return null;
    };

    type SnapshotRow = { user_id: string; date: string; total_value: number; breakdown: Record<string, number>; native_breakdown: Record<string, number> };

    // Computes a single date's row from the CURRENT asset set — the same logic
    // used for the standard backfill pass, factored out so a rebuild can also
    // recompute arbitrary pre-existing (e.g. daily-cron) dates that fall
    // outside the standard sparse `dates` set.
    const computeRow = (date: string): SnapshotRow | null => {
      const asOf = new Date(date + "T12:00:00Z");
      let total = 0;
      const breakdown: Record<string, number> = {};
      const nativeByCur: Record<string, number> = {};

      for (const asset of assets) {
        const type = asset.type as string;
        const inception = acquisitionByAsset.get(asset.id as string) ?? (asset.created_at as string).slice(0, 10);
        // A sold (soft-deleted) asset stops contributing from its sale date.
        // Tradeables also stop via their remove mutation zeroing units; this
        // gate is what makes property / cash / bonds / pension stop too.
        const removalDate = removalByAsset.get(asset.id as string);
        const removed = removalDate != null && date >= removalDate;
        let contribution = 0;
        let nativeContribution = 0;
        let nativeCurrency = "USD";

        if (TRADEABLE.has(type) && asset.symbol) {
          const timeline = mutsByAsset.get(asset.id as string) ?? [];
          const units = unitsAtDate(timeline, date);
          if (units > 0) {
            const history = priceHistories.get(asset.symbol as string);
            if (history) {
              // Fall FORWARD to the earliest candle when the date precedes the
              // symbol's price history: the timeline says the position was held,
              // so the earliest known price is the honest estimate — valuing it
              // at 0 carved a notch into the curve at exactly these dates.
              const priceEntry = priceAtOrBefore(history, date) ?? history[0];
              if (priceEntry) {
                const raw = normalizePrice(priceEntry.price, priceEntry.currency);
                const cur = priceEntry.currency === "GBp" ? "GBP" : priceEntry.currency;
                const native = raw * units;
                const rate = rateAt(date, cur);
                contribution = cur === "USD" ? native : (rate ? native / rate : 0);
                nativeContribution = native;
                nativeCurrency = cur;
              }
            }
          }
        } else if (type === "real_estate") {
          // Use buy_date as the real-estate inception so a freshly-added asset
          // (created_at = today) still produces historical rows back to purchase.
          const buyDateNorm = normalizeBuyDate(asset.buy_date as string | null);
          const reInception = buyDateNorm ?? inception;
          if (date >= reInception && !removed) {
            // Freeze property value per calendar month: every date anchors to
            // the 1st of its calendar month (clamped forward to acquisition),
            // including the current month — so a daily write within a month
            // always reproduces the same equity, byte-identical to writeSnapshot.
            const monthStart = date.slice(0, 7) + "-01";
            const anchor = monthStart < reInception ? reInception : monthStart;

            const cur = (asset.currency as string | null) || "USD";
            const buyPrice = asset.buy_price as number | null;
            const currentValue = asset.value as number;
            const tFn = realEstateT.get(asset.id as string);
            const grossValue = (tFn && buyPrice && buyPrice > 0)
              ? buyPrice + tFn(anchor) * (currentValue - buyPrice)
              : currentValue;
            const balFn = realEstateBalanceAt.get(asset.id as string);
            let balance = balFn ? balFn(anchor) : computeCurrentBalance(asset, new Date(anchor + "T12:00:00Z"));
            balance = Math.max(0, Math.min(balance, grossValue));
            const equity = grossValue - balance;
            const reRate = rateAt(anchor, cur);
            contribution = cur === "USD" ? equity : (reRate ? equity / reRate : 0);
            nativeContribution = equity;
            nativeCurrency = cur;
          }
        } else {
          // Cash / bonds / pension / other: held flat at current value from
          // acquisition (the add mutation's occurred_at = stated buy_date) —
          // not from when the row was created in the DB. Stops at the sale date.
          if (date >= inception && !removed) {
            const cur = (asset.currency as string | null) || "USD";
            const val = asset.value as number;
            const flatRate = rateAt(date, cur);
            contribution = cur === "USD" ? val : (flatRate ? val / flatRate : 0);
            nativeContribution = val;
            nativeCurrency = cur;
          }
        }

        if (contribution > 0) {
          total += contribution;
          breakdown[type] = (breakdown[type] ?? 0) + contribution;
          nativeByCur[nativeCurrency] = (nativeByCur[nativeCurrency] ?? 0) + nativeContribution;
        }
      }

      if (total > 0) {
        return {
          user_id: userId,
          date,
          total_value: Math.round(total),
          breakdown,
          native_breakdown: Object.fromEntries(Object.entries(nativeByCur).map(([c, v]) => [c, Math.round(v)])),
        };
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

    // Overwrite on conflict (not ignoreDuplicates): every row is recomputed
    // from the current asset set, so re-running this pass HEALS a stale vintage
    // rather than leaving it in place to interleave with fresh rows. today's
    // row is never in `dates` (filtered < todayStr), so the live cron's row is
    // never disturbed.
    const { error: upsertError } = await supabase.from("snapshots").upsert(rows, {
      onConflict: "user_id,date",
    });
    if (upsertError) throw upsertError;
  } catch (err) {
    Sentry.captureException(err, {
      tags: { fn: "backfillSnapshots" },
      extra: { user_id: userId },
    });
  }
}

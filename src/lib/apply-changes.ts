import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchHistoricalPrice, normalizePrice } from "./prices";
import { fetchPriceWithFallback, fetchYahooPrice, fetchYahooQuote } from "./prices-server";
import { resolveSymbol, normalizeCryptoSymbol } from "./symbol-aliases";
import { mapWithConcurrency } from "./concurrency";
import { computeNetWorth, realEstateEquity } from "./utils";
import { getUsdRates } from "./fx";
import { countryToCurrency, countryFromAddress } from "./country-currency";
import { isCostBasisOnlyEdit, applyCostBasisOnly } from "./cost-basis";
import { parseAcquisitionMonth } from "./acquisition-date";
import { estimatePropertyValue } from "./property-estimate-resolve";
import {
  validatePensionChange,
  pensionShapeOfKind,
  DEFAULT_PENSION_ACCESS_AGE,
  type PensionKind,
  type PensionChangeInput,
} from "./pension-intake";
import { validateRealEstateChange } from "./real-estate-intake";
import { venueCountryForCurrency } from "./venues";

const TRADEABLE_TYPES = new Set(["stocks", "etf", "crypto", "gold"]);
// Non-tradeable, non-priced classes whose worth is the stated value itself.
// They carry no live price and no estimate engine, so an add with no positive
// value would persist a 0-value ghost — the write path requires a value for these.
const SIMPLE_VALUE_TYPES = new Set(["cash", "bond", "bonds", "other"]);

// Price-freshness check: if proposal → commit gap exceeds this window,
// re-fetch the live price and reject if it moved more than the threshold.
const PRICE_FRESHNESS_WINDOW_MS = 60_000; // 60 seconds
const PRICE_MOVE_THRESHOLD = 0.01;       // 1%

type CurrentAsset = {
  id: string;
  name: string;
  type: string;
  value: number;
  currency: string;
  symbol?: string | null;
  units?: number | null;
  mortgage_balance?: number | null;
  country?: string | null;
  // Acquisition anchors — needed to scope a history rebuild when this asset is
  // removed/edited. Present on full asset rows (select *).
  buy_date?: string | null;
  created_at?: string | null;
  // Pension fields — present on pension rows; needed to merge + re-validate edits.
  pension_kind?: PensionKind | null;
  annual_income?: number | null;
  monthly_contribution?: number | null;
  mortgage_rate?: number | null;
  access_age?: number | null;
  pension_provider?: string | null;
};

export type PortfolioChange = {
  action: "add" | "edit" | "remove";
  name: string;
  new_name?: string;
  type?: string;
  value?: number;
  currency?: string;
  country?: string;
  symbol?: string;
  units?: number;
  buy_price?: number;
  buy_date?: string;
  // Remove-only. "sold" (default): a real disposal on `sell_date` (or today) —
  // history up to the sale is preserved (soft-delete). "mistake": the position
  // never truly belonged here — erase it from all history (hard-delete + drop
  // its mutations). See the remove branch.
  removal_reason?: "sold" | "mistake";
  // Data correction (any action): the stored data is WRONG, not a new financial
  // event. Fix it and leave no trace — no "Recorded a new valuation" journal
  // row, no bump in the net-worth graph. On an edit, the acquisition record is
  // rewritten in place so history reads as if the corrected figure had always
  // been true; on a remove it means the same as removal_reason "mistake" (full
  // erase). See the edit and remove branches.
  correction?: boolean;
  sell_date?: string;
  buy_price_source?: string;
  mortgage_balance?: number;
  mortgage_rate?: number;
  monthly_payment?: number;
  mortgage_type?: string;
  mortgage_start_date?: string;
  mortgage_end_date?: string;
  coupon_rate?: number;
  maturity_date?: string;
  issuer?: string;
  isin?: string;
  // Pension intake fields
  pension_kind?: PensionKind | null;
  annual_income?: number | null;
  monthly_contribution?: number | null;
  access_age?: number | null;
  pension_provider?: string | null;
  address?: string;
  property_type?: string;
  size_sqm?: number;
  latitude?: number;
  longitude?: number;
  value_delta?: number;
  personal_context?: string;
};

export class ValueModeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValueModeError";
  }
}

// Coerce a stated bond maturity into a full ISO date the DB `date` column accepts.
// The model may emit a full date ("2029-03-01"), a year-month ("2029-03"), a bare
// year ("2030"), or natural language ("March 2029"); a bare year/month is anchored
// to the first day so the insert never fails on a partial date. Unparseable input
// returns null (omit it) rather than breaking the whole add.
// Turns whatever date phrase the model passed through verbatim ("around March
// 2021", "2021-03-15", "track from now") into a stored ISO date or null.
// Unparseable text is stored as null rather than risk a garbage `date` write —
// deterministic code owns this decision, never the model.
function resolveAcquisitionDate(raw: string | null | undefined): string | null {
  const parsed = parseAcquisitionMonth(raw);
  return parsed ?? null;
}

function normalizeMaturityDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

// USD-bridged cross-currency conversion using the app's existing FX rates.
// rates[X] = how many X per 1 USD, so: amount_from / rates[from] * rates[to]
// A missing rate is a hard error, not a silent 1:1 fallback: converting e.g.
// HUF→USD at parity would derive a wildly wrong unit count and value. Surfacing
// it asks the user to restate the amount instead of storing a corrupt position.
async function convertCurrency(amount: number, from: string, to: string): Promise<number> {
  if (from === to) return amount;
  const rates = await getUsdRates();
  const fromRate = from === "USD" ? 1 : rates[from];
  const toRate   = to   === "USD" ? 1 : rates[to];
  if (!fromRate || !toRate) {
    throw new ValueModeError(
      `I couldn't convert between ${from} and ${to} right now — could you state the amount in ${to}?`
    );
  }
  return (amount / fromRate) * toRate;
}

export type MutationMeta = {
  id: string;
  symbol: string | null;
  occurredAt: string;
  assetType: string | null;
};

// Best-effort stamp of the outstanding mortgage balance onto a real-estate
// mutation, so the net-worth history can reconstruct equity at a past date from
// the balance in effect then. Guarded: in a pre-migration environment the column
// doesn't exist and the update fails — swallowed, since the reconstruction falls
// back to the amortisation schedule until the column is applied.
async function stampMortgageBalance(supabase: SupabaseClient, mutationId: string, balance: number): Promise<void> {
  try {
    await supabase.from("mutations").update({ mortgage_balance: balance }).eq("id", mutationId);
  } catch {
    /* column not yet applied — safe to skip */
  }
}

export async function applyPortfolioChanges({
  supabase,
  userId,
  changes,
  currentAssets,
  contextNote,
  proposalTimestamp,
  confirmedProposal,
  displayCurrency,
}: {
  supabase: SupabaseClient;
  userId: string;
  changes: PortfolioChange[];
  currentAssets: CurrentAsset[];
  contextNote: string | null;
  proposalTimestamp?: string | null;
  // True when this commit is the user confirming a prior proposal ("Confirm and
  // save"). On a confirmed commit the resolved units were derived at PROPOSE
  // time, so re-validate the live price now and reject if it moved past the
  // threshold — closing the gap where a fast (sub-window) confirm committed
  // stale units. Direct (non-confirmation) adds never trigger this, so a fresh
  // Mode-3 add can't false-positive.
  confirmedProposal?: boolean;
  // The user's display currency. Used only as the native-currency fallback for
  // non-tradeable, non-real-estate adds (cash/bonds/other/pension) when the
  // model omits currency — a EUR/GBP user saying "I have 50k in savings" should
  // not be stored as USD. Tradeables still take Yahoo's native currency; real
  // estate still derives from country. Defaults to USD when not provided (keeps
  // the agent-loop caller, which doesn't pass it, byte-identical to before).
  displayCurrency?: string;
}): Promise<{ changed: boolean; duplicateWarnings: string[]; fxWarnings: string[]; mutationMetas: MutationMeta[]; failures: { name: string; reason: string; clarification?: boolean }[]; rebuildFrom: string | null }> {
  const fallbackCurrency = displayCurrency ?? "USD";
  // Fetch FX rates once for running-total USD conversion (metadata only — not used for storage).
  const usdRates = await getUsdRates();
  const toUsdSync = (amount: number, currency: string): number => {
    if (currency === "USD") return amount;
    const rate = usdRates[currency];
    return rate ? amount / rate : amount;
  };
  let runningTotal = computeNetWorth(currentAssets, toUsdSync);
  const duplicateWarnings: string[] = [];
  const fxWarnings: string[] = [];
  const mutationMetas: MutationMeta[] = [];
  // Per-row failures collected so one bad row in a multi-row batch (e.g. a
  // screenshot import) reports and skips rather than aborting every other row.
  // `clarification` marks a failure whose reason is a user-facing intake question
  // (a ValueModeError — e.g. "Is there a mortgage on it?"), which is deterministic
  // and NOT fixed by retrying; callers surface those verbatim instead of a generic
  // "temporary hiccup, try again" line.
  const failures: { name: string; reason: string; clarification?: boolean }[] = [];
  // Symbols/names already added EARLIER in this same batch. The duplicate check
  // below only knows the pre-batch portfolio, so a broker screenshot that lists
  // the same position twice (e.g. two overlapping scrolled panels) would add the
  // first and then collide on the second — surfacing as "Couldn't record". Track
  // within-batch adds so the repeat is treated as a duplicate (a warning), not a
  // failure.
  const addedSymbolsThisBatch = new Set<string>();
  const addedNamesThisBatch = new Set<string>();
  let changed = false;

  // Earliest date from which historical snapshot rows must be rebuilt (not
  // upsert-skipped) so they actually include/exclude the asset this turn
  // touched. Computed HERE — the one place that resolves every date and writes
  // every mutation — so the two callers (chat route + agent loop) don't each
  // re-derive it from drifting heuristics. null = no historical rows changed
  // (e.g. an add/sale dated today; writeSnapshot owns today's row).
  const todayStr = new Date().toISOString().slice(0, 10);
  let rebuildFrom: string | null = null;
  const considerRebuild = (d: string | null | undefined) => {
    if (!d) return;
    const day = d.slice(0, 10);
    if (day >= todayStr) return; // today's row is owned by writeSnapshot
    if (rebuildFrom === null || day < rebuildFrom) rebuildFrom = day;
  };

  // Collapse duplicate ADD rows up front, before any network resolution: a broker
  // screenshot uploaded as two overlapping scrolled panels emits the same holding
  // once per panel, ~doubling the batch. De-duplicate by the model's emitted
  // symbol (alias-resolved, no network), else name, keeping the first — this
  // halves the Yahoo fan-out below and removes the duplicate-warning noise. Non-
  // add actions are never collapsed.
  const seenAddKeys = new Set<string>();
  changes = changes.filter((c) => {
    if (c.action !== "add") return true;
    const key = ((c.symbol ? resolveSymbol(c.symbol) : "") || c.symbol || c.name || "").trim().toLowerCase();
    if (!key) return true;
    if (seenAddKeys.has(key)) return false;
    seenAddKeys.add(key);
    return true;
  });

  // Alias-resolve symbols synchronously before any I/O (e.g. TL0.DE → TSLA)
  const aliasedSymbols = changes.map((change) =>
    change.action === "add" && change.symbol ? resolveSymbol(change.symbol) : null
  );

  // Bound the outbound Yahoo fan-out. A large screenshot import used to fire ~4
  // lookups PER ROW across three UNBOUNDED Promise.all blocks (100+ concurrent
  // for a 32-row batch), which Yahoo 429-throttles — surfacing as "Couldn't
  // record N positions". Cap in-flight requests so a bulk import can't storm the
  // upstream. Each row's resolver catches its own errors and returns null, so one
  // failed lookup degrades that row instead of aborting the whole batch.
  const YAHOO_CONCURRENCY = 5;

  // Pre-resolve venue-qualified symbols for add ops, bounded-concurrent.
  const resolvedSymbols = await mapWithConcurrency(changes, YAHOO_CONCURRENCY, async (change, i) => {
    try {
      const sym = aliasedSymbols[i];
      if (change.action === "add" && sym) {
        const normalizedSym = normalizeCryptoSymbol(sym, change.type);
        // Venue auto-resolution: a bare UCITS ETF ticker (no exchange suffix)
        // can't price on Yahoo directly, so fetchPriceWithFallback fans out to a
        // country's exchange-priority suffixes. Tradeables carry no country, so
        // fall back to one derived from the user's display currency — this is how
        // "VWCE" lands on the EUR/GBP listing without ever asking which exchange.
        const venueCountry = change.country ?? venueCountryForCurrency(fallbackCurrency);
        const result = await fetchPriceWithFallback(normalizedSym, venueCountry);
        if (!result.error) return { symbol: result.symbol, nativeCurrency: result.nativeCurrency };
      }
    } catch { /* transient lookup failure — degrade this row, not the batch */ }
    return null;
  });

  // Pre-resolve prices for add ops that need auto-fill, bounded-concurrent. `value`
  // (current market value) and `buy_price` (cost basis) come from separate
  // lookups: buy_price is the price AT buy_date (or "now" if unstated), while
  // value is units x the LATEST market price — never the buy_date price, which
  // would set value to cost basis instead of market.
  const resolvedPrices = await mapWithConcurrency(changes, YAHOO_CONCURRENCY, async (change, i) => {
    try {
      if (change.action === "add" && (change.value || 0) === 0 && change.symbol && change.units) {
        const effectiveSymbol = resolvedSymbols[i]?.symbol ?? aliasedSymbols[i] ?? change.symbol;
        const [histData, live] = await Promise.all([
          fetchHistoricalPrice(effectiveSymbol, change.buy_date || null),
          fetchYahooPrice(effectiveSymbol),
        ]);
        const buyPrice = histData ? normalizePrice(histData.price, histData.currency) : null;
        const livePrice = !live.error && live.price > 0 ? live.price : null;
        const valuePrice = livePrice ?? buyPrice;
        if (valuePrice == null) return null;

        const valueCurrency = livePrice != null
          ? live.nativeCurrency
          : (histData!.currency === "GBp" ? "GBP" : histData!.currency);

        return {
          value: Math.round(valuePrice * change.units!),
          buyPrice: Math.round((buyPrice ?? valuePrice) * 100) / 100,
          yahooCurrency: valueCurrency,
        };
      }
    } catch { /* transient lookup failure — degrade this row, not the batch */ }
    return null;
  });

  // Fetch canonical names from Yahoo for tradeable adds, bounded-concurrent.
  const resolvedNames = await mapWithConcurrency(changes, YAHOO_CONCURRENCY, async (change, i) => {
    try {
      if (change.action === "add" && change.symbol && TRADEABLE_TYPES.has(change.type ?? "")) {
        const effectiveSymbol = resolvedSymbols[i]?.symbol ?? aliasedSymbols[i] ?? change.symbol;
        const quote = await fetchYahooQuote(effectiveSymbol);
        const resolved = (quote.longName ?? quote.shortName ?? "").trim();
        return resolved || null;
      }
    } catch { /* transient lookup failure — degrade this row, not the batch */ }
    return null;
  });

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const { action, name } = change;

    if (!name?.trim()) continue;

    // Normalize the legacy singular "bond" to the canonical "bonds" the data model
    // (BondsAsset.type) and every downstream surface (detail routing, category map,
    // labels, logo, vitals) key on. The agent tool schema now emits "bonds", but a
    // stale client — or the old singular anywhere — must never persist as "bond":
    // it would 404 the detail page and mis-handle the position in vitals.
    if (change.type === "bond") change.type = "bonds";

    // Normalize whatever date phrase the model passed through verbatim ("around
    // March 2021", "early 2015", "2021-03-15") into a stored ISO date up front,
    // so every downstream use (asset write, mutation, historical-price lookup,
    // cost-basis fetch) sees the same resolved value. Unparseable text becomes
    // null — deterministic code owns this decision, never the model.
    if (change.buy_date !== undefined) {
      change.buy_date = resolveAcquisitionDate(change.buy_date) ?? undefined;
    }

    // A dated add (or a buy_date correction on an edit) changes what every
    // historical row from that date forward should contain — flag the rebuild.
    // Real-estate edits also ripple (value/shape), even without a buy_date.
    if (action === "add" || action === "edit") {
      considerRebuild(change.buy_date);
    }

    try {
    if (action === "add") {
      const resolvedAssetName =
        TRADEABLE_TYPES.has(change.type ?? "") && resolvedNames[i]
          ? resolvedNames[i]!
          : name;
      let effectiveSymbol = resolvedSymbols[i]?.symbol ?? aliasedSymbols[i] ?? change.symbol ?? null;
      // Crypto tickers MUST be venue-normalized (BTC → BTC-USD) before any price
      // lookup or storage: a bare "BTC" resolves on Yahoo to an unrelated equity
      // (Bit Brother Ltd), so a value-mode add would derive units from the wrong
      // instrument. The bounded pre-resolve already normalizes; this covers the
      // fallback branch (aliased/raw) when that lookup transiently missed, so the
      // value-mode price fetch below and the symbol we store both stay canonical.
      if (effectiveSymbol && change.type === "crypto") {
        effectiveSymbol = normalizeCryptoSymbol(effectiveSymbol, change.type);
      }

      const dupSymKey = effectiveSymbol?.toLowerCase() ?? null;
      const dupNameKey = resolvedAssetName.trim().toLowerCase();
      const isDuplicate = dupSymKey
        ? currentAssets.some((a) => a.symbol && a.symbol.toLowerCase() === dupSymKey) || addedSymbolsThisBatch.has(dupSymKey)
        : currentAssets.some((a) => a.name.trim().toLowerCase() === dupNameKey) || addedNamesThisBatch.has(dupNameKey);

      if (isDuplicate) {
        // Date-fill promotion: a re-stated add can carry the acquisition date the
        // model just collected (e.g. the import flow re-emitting a held position as
        // an add rather than an edit). If that date is present and the EXISTING row
        // still has none, don't discard it as a bare duplicate — stamp it onto the
        // existing position (asset + its "add" mutation) so the stated date is never
        // silently lost. Only applies to a pre-batch row (found in currentAssets);
        // a within-batch repeat is left as a warning.
        const existingDup = dupSymKey
          ? currentAssets.find((a) => a.symbol && a.symbol.toLowerCase() === dupSymKey)
          : currentAssets.find((a) => a.name.trim().toLowerCase() === dupNameKey);
        if (change.buy_date && existingDup && !existingDup.buy_date) {
          await supabase.from("assets")
            .update({ buy_date: change.buy_date }).eq("id", existingDup.id).eq("user_id", userId);
          await supabase.from("mutations")
            .update({ occurred_at: change.buy_date })
            .eq("user_id", userId).eq("asset_id", existingDup.id).eq("action", "add");
          considerRebuild(change.buy_date);
          changed = true;
          continue;
        }
        const id = effectiveSymbol ? effectiveSymbol.toUpperCase() : `"${resolvedAssetName}"`;
        duplicateWarnings.push(
          `${id} already exists in your portfolio. If you want to update the existing position, ask me to edit it — or give the new entry a different name to keep both.`
        );
        continue;
      }

      let resolvedValue = change.value || 0;
      let resolvedBuyPrice: number | null = change.buy_price || null;
      const isRealEstate = (change.type || "other") === "real_estate";

      // Required-data gate for a property add: a resolvable value AND an explicit
      // mortgage decision (balance, or 0 for owned outright). A single-row commit
      // rethrows this so the assistant surfaces the exact question; in a batch it
      // is collected as a per-row failure. This is what stops a property from
      // silently landing as "Owned outright" when a mortgage was never captured.
      if (isRealEstate) {
        const gate = validateRealEstateChange(change);
        if (!gate.ok) throw new ValueModeError(gate.question);
      }

      // Simple value-based classes (cash / savings, bonds, other) must carry a
      // positive value: they are NOT live-priced, so a value-less add would
      // persist a 0-value ghost. (real_estate has its own value path via the
      // estimate engine + gate above; pension carries value per its shape.)
      // Key the gate on the RESOLVED type (change.type || "other"), not the raw
      // one: an add with the type omitted is stored as "other" below, so it must
      // be gated as "other" here too — otherwise a typeless, value-less add slips
      // through and lands as a €0 "other" ghost.
      if (SIMPLE_VALUE_TYPES.has(change.type || "other") && !(typeof change.value === "number" && change.value > 0)) {
        throw new ValueModeError(`What's ${resolvedAssetName} worth? I need a current value to record it.`);
      }

      // Houses always carry a country: use the stated one, else recover it from
      // the canonical address ("…, City, Netherlands" → "NL"). This drives the
      // native currency, the indicative-value estimate's NL check, and the
      // stored country column, so a property added by address alone is never
      // left country-less. Non-property types keep the stated country as-is.
      const resolvedCountry = isRealEstate
        ? (change.country || countryFromAddress(change.address) || null)
        : (change.country ?? null);

      // For real estate, derive native currency from country when Claude omits it.
      // For tradeables, Yahoo overrides this below. Other types (cash/bonds/
      // other/pension) fall back to the user's display currency, not USD.
      let resolvedCurrency = change.currency || (
        isRealEstate ? countryToCurrency(resolvedCountry) : fallbackCurrency
      );

      if (resolvedSymbols[i]?.nativeCurrency) resolvedCurrency = resolvedSymbols[i]!.nativeCurrency;

      const resolved = resolvedPrices[i];
      if (resolved) {
        if (resolvedValue === 0) resolvedValue = resolved.value;
        if (!resolvedBuyPrice) resolvedBuyPrice = resolved.buyPrice;
        if (resolved.yahooCurrency) resolvedCurrency = resolved.yahooCurrency;
      }

      // Value-mode: user stated a monetary amount; derive units from live Yahoo price.
      // Only fires for tradeable adds that have a value but no units.
      const isTradeable = TRADEABLE_TYPES.has(change.type ?? "");
      const hasUnits = typeof change.units === "number" && change.units > 0;
      const hasValue = typeof change.value === "number" && change.value > 0;

      // A units-mode tradeable whose live price couldn't be resolved (a transient
      // upstream miss during a bulk import) would land at value 0. Tradeables are
      // live-priced from units on read, so this self-corrects — but seed a sensible
      // initial value from the stated cost basis so the position never shows €0
      // before the first live price lands.
      if (isTradeable && hasUnits && resolvedValue === 0 && resolvedBuyPrice && resolvedBuyPrice > 0) {
        resolvedValue = Math.round(resolvedBuyPrice * change.units!);
      }

      if (isTradeable && effectiveSymbol && !hasUnits && hasValue) {
        // Retry a transient price miss a couple of times before giving up — a bulk
        // import can still catch an occasional throttle even with the bounded fan-out.
        let priceResult = await fetchYahooPrice(effectiveSymbol);
        for (let attempt = 0; attempt < 2 && (priceResult.error || !priceResult.price || priceResult.price <= 0); attempt++) {
          await new Promise((r) => setTimeout(r, 400));
          priceResult = await fetchYahooPrice(effectiveSymbol);
        }

        if (priceResult.error || !priceResult.price || priceResult.price <= 0) {
          throw new ValueModeError(
            `Couldn't fetch a live price for ${effectiveSymbol} right now — could you state the unit count instead?`
          );
        }

        // An untagged amount is in the user's OWN (display) currency, not the
        // instrument's native currency — "put 10k into Apple" means 10k of their
        // money, and defaulting to Yahoo's native (USD) treated €10k as $10k,
        // over-scaling the derived share count by the FX rate.
        const statedCurrency = change.currency ?? fallbackCurrency;
        let valueInYahooCurrency = change.value!;
        if (statedCurrency !== priceResult.nativeCurrency) {
          valueInYahooCurrency = await convertCurrency(
            change.value!,
            statedCurrency,
            priceResult.nativeCurrency,
          );
        }

        // crypto → 8 decimal places (Bitcoin convention); stocks/etf/gold → 4 (fractional shares)
        const decimals = change.type === "crypto" ? 8 : 4;
        const rawUnits = valueInYahooCurrency / priceResult.price;
        const derivedUnits = Math.round(rawUnits * Math.pow(10, decimals)) / Math.pow(10, decimals);
        const derivedValue = Math.round(derivedUnits * priceResult.price * 100) / 100;

        // The stated amount is too small to buy even the smallest tracked
        // fraction — storing it would create a 0-unit, 0-value ghost position.
        if (derivedUnits <= 0) {
          throw new ValueModeError(
            `That amount is too small to record even a fraction of ${effectiveSymbol} — could you give a larger amount, or the unit count instead?`
          );
        }

        change.units = derivedUnits;
        change.value = derivedValue;
        change.currency = priceResult.nativeCurrency;
        resolvedValue = derivedValue;
        resolvedCurrency = priceResult.nativeCurrency;
        // buy_price intentionally omitted — this is "at market price", not a basis declaration.
      }

      // Ghost guard for live-priced classes. A tradeable is valued on read as
      // units × live price (live-pricing.ts, snapshot.ts both require symbol AND
      // units). So a tradeable that STILL has no resolvable value here AND lacks
      // the symbol+units pair can never self-price — it would persist as a
      // permanent €0 row (e.g. units-only gold with no ticker, or "I hold Apple"
      // with no quantity). Every value-based class is gated above; gate tradeables
      // too. A row that HAS symbol + units is left alone: even if this fetch
      // missed, it self-heals from the live price on the next read.
      const unitsPresent = typeof change.units === "number" && change.units > 0;
      if (isTradeable && resolvedValue <= 0 && !(effectiveSymbol && unitsPresent)) {
        throw new ValueModeError(
          `How much ${resolvedAssetName} do you hold? Tell me a quantity or its current value and I'll record it.`
        );
      }

      // Price-freshness check for Turn-2 commits (resolved units + value from a prior proposal).
      // Only runs when the proposal is stale (> PRICE_FRESHNESS_WINDOW_MS) and the change has
      // both units and value (the shape Claude emits on Turn 2 after confirming a proposal).
      if (
        isTradeable && effectiveSymbol && hasUnits && hasValue &&
        (confirmedProposal ||
          (proposalTimestamp &&
            Date.now() - new Date(proposalTimestamp).getTime() > PRICE_FRESHNESS_WINDOW_MS))
      ) {
        const freshPrice = await fetchYahooPrice(normalizeCryptoSymbol(effectiveSymbol, change.type));
        if (!freshPrice.error && freshPrice.price && freshPrice.price > 0) {
          const impliedPrice = change.value! / change.units!;
          const priceDiff = Math.abs(freshPrice.price - impliedPrice) / impliedPrice;
          if (priceDiff > PRICE_MOVE_THRESHOLD) {
            throw new ValueModeError(
              "The market moved while you were confirming — would you like to see updated numbers?"
            );
          }
        }
      }

      // Monetary fields stay in the asset's native currency — no conversion to USD.
      // toUsdSync is used only for the runningTotal metadata below.
      const resolvedMortgageBalance = change.mortgage_balance ?? null;
      const resolvedMonthlyPayment = change.monthly_payment ?? null;

      const resolvedLat: number | null = change.latitude ?? null;
      const resolvedLng: number | null = change.longitude ?? null;

      // Indicative current value: a property add with a logged purchase (price +
      // date) but no stated value gets a deterministic estimate from the regional
      // CBS PBK index. Server-authoritative — the figure is computed here, not by
      // the model. An override (the user's own figure) arrives as change.value and
      // skips this entirely. Unavailable estimates leave the value untouched.
      let valueProvenance: string | null = null;
      if (
        isRealEstate &&
        (change.value == null || change.value === 0) &&
        resolvedBuyPrice != null &&
        change.buy_date
      ) {
        const est = await estimatePropertyValue({
          address: change.address ?? null,
          country: resolvedCountry,
          buyPrice: resolvedBuyPrice,
          buyDate: change.buy_date,
        });
        if (est.available && est.currentEstimate != null) {
          resolvedValue = est.currentEstimate;
          valueProvenance = `Initial value set from indicative regional estimate (${est.regionName}, ${est.asOfPeriod}${est.clamped ? ", indexed from 1995" : ""}).`;
        }
      }

      // Safety net: a property must never be stored at 0. If no value was given and
      // the indicative estimate was unavailable (e.g. a non-NL property, which CBS
      // cannot estimate, or a CBS miss), resolvedValue is still 0 here. Skip the
      // insert and ask for the current value rather than committing a EUR 0 asset.
      // No asset row and no mutation are written for the skipped add. For a single
      // add this surfaces the message to the user; in a multi-row batch it is
      // collected as a per-row failure and the other rows continue.
      if (isRealEstate && (resolvedValue == null || resolvedValue <= 0)) {
        throw new ValueModeError(
          `I couldn't estimate a value for ${resolvedAssetName} — what is its current value?`
        );
      }

      // Pension intake: enforce the deterministic gate, then set shape-correct
      // fields. CAPITAL keeps value + mortgage_rate(growth) + monthly_contribution;
      // INCOME (db/state) leaves value NULL and carries annual_income only, so an
      // income entitlement never lands on the balance sheet.
      let pensionKind: PensionKind | null = null;
      let pensionAnnualIncome: number | null = null;
      let pensionMonthlyContribution: number | null = null;
      let pensionAccessAge: number | null = null;
      let pensionProvider: string | null = null;
      let pensionGrowthRate: number | null = change.mortgage_rate ?? null;
      let insertValue: number | null = resolvedValue;
      if ((change.type || "other") === "pension") {
        const gate = validatePensionChange(change);
        if (!gate.ok) throw new ValueModeError(gate.question);
        pensionKind = (change.pension_kind ?? "dc") as PensionKind;
        pensionAccessAge = change.access_age ?? null;
        pensionProvider = (change.pension_provider ?? "").trim() || null;
        if (pensionShapeOfKind(pensionKind) === "income") {
          pensionAnnualIncome = change.annual_income ?? null;
          pensionMonthlyContribution = null;
          pensionGrowthRate = null;   // income has no growth assumption
          pensionAccessAge = pensionAccessAge ?? DEFAULT_PENSION_ACCESS_AGE; // optional start age
          insertValue = null;          // off-balance: no owned pot
          resolvedValue = 0;           // running-total metadata contribution is 0
        } else {
          pensionAnnualIncome = null;
          pensionMonthlyContribution = change.monthly_contribution ?? 0;
        }
      }

      const { data: inserted, error } = await supabase.from("assets").insert({
        name: resolvedAssetName,
        type: change.type || "other",
        value: insertValue,
        currency: resolvedCurrency,
        country: resolvedCountry,
        symbol: effectiveSymbol,
        units: change.units || null,
        buy_price: resolvedBuyPrice,
        buy_date: change.buy_date || null,
        buy_price_source: change.buy_price_source || null,
        mortgage_balance: resolvedMortgageBalance,
        mortgage_balance_recorded_at: resolvedMortgageBalance != null ? new Date().toISOString() : null,
        mortgage_rate: pensionGrowthRate,
        monthly_payment: resolvedMonthlyPayment,
        pension_kind: pensionKind,
        annual_income: pensionAnnualIncome,
        monthly_contribution: pensionMonthlyContribution,
        access_age: pensionAccessAge,
        pension_provider: pensionProvider,
        mortgage_type: change.mortgage_type || null,
        mortgage_start_date: change.mortgage_start_date || null,
        mortgage_end_date: change.mortgage_end_date || null,
        coupon_rate: change.coupon_rate ?? null,
        maturity_date: normalizeMaturityDate(change.maturity_date),
        issuer: change.issuer || null,
        isin: change.isin || null,
        address: change.address || null,
        property_type: change.property_type || null,
        size_sqm: change.size_sqm || null,
        latitude: resolvedLat,
        longitude: resolvedLng,
        user_id: userId,
      }).select("id").single();

      if (error) {
        // Surface the failure instead of silently swallowing it — otherwise the
        // asset is never written yet the model still narrates "Logged". Recorded
        // as a per-row failure so the commit tool reports it back to the user.
        console.error("ADD ERROR:", error);
        failures.push({ name: resolvedAssetName, reason: error.message });
      } else {
        const addOccurredAt = change.buy_date || new Date().toISOString().split("T")[0];
        // A property acquisition is recorded as the PURCHASE (buy_price at buy_date),
        // not the current/indicative value — the value estimate lives on the asset
        // row. This keeps the activity line "Bought <purchase price>" honest and lets
        // the detail view show real appreciation since purchase. Other asset types
        // (and properties added without a purchase price) record the add's value.
        const acquisitionAmount =
          pensionKind && pensionShapeOfKind(pensionKind) === "income"
            ? pensionAnnualIncome ?? 0
            : isRealEstate && resolvedBuyPrice != null && resolvedBuyPrice > 0
              ? resolvedBuyPrice
              : resolvedValue;
        // Only commit the running total once the mutation lands, so a failed
        // mutation insert doesn't leave the recorded portfolio_total drifting.
        // A mortgaged property adds only its EQUITY to net worth (the same basis
        // computeNetWorth seeds runningTotal with, and the edit/remove paths use);
        // adding the full market value overstated portfolio_total by the mortgage
        // and let that drift into every later row in the batch.
        const addNetWorthContribution = isRealEstate
          ? realEstateEquity(resolvedValue, resolvedMortgageBalance)
          : resolvedValue;
        const newRunningTotal = runningTotal + toUsdSync(addNetWorthContribution, resolvedCurrency);
        const { data: addedMutation, error: addMutError } = await supabase.from("mutations").insert({
          user_id: userId,
          asset_id: inserted?.id || null,
          asset_name: resolvedAssetName,
          action: "add",
          asset_type: change.type || "other",
          symbol: effectiveSymbol,
          after_value: acquisitionAmount,
          before_units: null,
          after_units: change.units || null,
          currency: resolvedCurrency,
          personal_context: valueProvenance || change.personal_context || contextNote,
          portfolio_total: newRunningTotal,
          occurred_at: addOccurredAt,
        }).select("id").single();
        if (addMutError) {
          // Roll back the orphaned asset. The asset+mutation pair is not a DB
          // transaction; an asset with no add-mutation corrupts the history
          // rebuild (no acquisition anchor) and never appears in the Diary. Far
          // safer to undo the row and report the failure than to keep a ghost.
          if (inserted?.id) await supabase.from("assets").delete().eq("id", inserted.id);
          console.error("ADD MUTATION ERROR (rolled back asset):", addMutError);
          failures.push({ name: resolvedAssetName, reason: addMutError.message });
        } else {
          changed = true;
          runningTotal = newRunningTotal;
          // Mark taken ONLY on success, so a later repeat of this ticker in the
          // same batch is caught as a duplicate — but a row that FAILED above
          // leaves its key free for a twin (from an overlapping panel) to record.
          if (dupSymKey) addedSymbolsThisBatch.add(dupSymKey);
          else addedNamesThisBatch.add(dupNameKey);
          if (addedMutation?.id) {
            mutationMetas.push({ id: addedMutation.id, symbol: effectiveSymbol, occurredAt: addOccurredAt, assetType: change.type || "other" });
            // Record the property's mortgage balance at acquisition so history can
            // step it (see stampMortgageBalance / the reconstruction).
            if (isRealEstate && resolvedMortgageBalance != null) {
              await stampMortgageBalance(supabase, addedMutation.id, resolvedMortgageBalance);
            }
          }
        }
      }

    } else if (action === "edit") {
      // Match by name, by symbol, and — for crypto — by venue-normalized symbol.
      // Crypto rows are stored under Yahoo's canonical name ("Bitcoin USD") and a
      // normalized symbol ("BTC-USD"), so an edit keyed by the bare ticker/name the
      // model extracted ("BTC", "Bitcoin") would otherwise match neither and throw
      // "couldn't find it to edit" — silently blocking a crypto date-fill.
      const nameLc = name.toLowerCase();
      // resolveSymbol can return null (unknown ticker), so resolve once and guard
      // before lowercasing — a raw .toLowerCase() on it fails strict null checks.
      const resolvedChangeSym = typeof change.symbol === "string" && change.symbol.trim()
        ? resolveSymbol(change.symbol)
        : null;
      const changeSym = resolvedChangeSym ? resolvedChangeSym.toLowerCase() : null;
      const existing = currentAssets.find((a) => {
        if (a.name.toLowerCase() === nameLc) return true;
        const aSym = a.symbol ? a.symbol.toLowerCase() : null;
        if (!aSym) return false;
        if (aSym === nameLc || (changeSym && aSym === changeSym)) return true;
        if (a.type === "crypto") {
          // Normalize the incoming ticker (change.symbol, else the edit name) to the
          // stored venue form ("BTC" → "BTC-USD"). Skip if neither resolves.
          const cryptoBase = resolvedChangeSym ?? resolveSymbol(name);
          if (cryptoBase) {
            const norm = normalizeCryptoSymbol(cryptoBase, "crypto").toLowerCase();
            if (aSym === norm) return true;
          }
        }
        return false;
      });

      if (existing) {
        // A real-estate edit changes value/mortgage shape, which ripples
        // across every historical row from acquisition forward (the property
        // value sampler interpolates buy→current). Rebuild from its inception,
        // independent of whether a buy_date was supplied this turn.
        if (existing.type === "real_estate") {
          considerRebuild(existing.buy_date ?? (existing.created_at ? existing.created_at.slice(0, 10) : null));
        }
        const hasValueDelta = typeof change.value_delta === "number" && change.value_delta !== 0;
        const editHasUnits = typeof change.units === "number";
        const isTradeable = TRADEABLE_TYPES.has(existing.type);

        if (hasValueDelta && isTradeable && !editHasUnits) {
          if (!existing.symbol) {
            throw new ValueModeError(
              `Couldn't apply a value-based change to ${existing.name} — no symbol on file. Could you state the unit count instead?`
            );
          }

          const normSym = normalizeCryptoSymbol(existing.symbol, existing.type);

          // Price the delta at the date the money actually moved. A BACK-DATED
          // contribution ("I put €5k into ETH back in February") must derive its
          // unit count from February's price — the mutation is dated then and the
          // net-worth history is rebuilt from then, so pricing it at today's
          // (different) price stored the wrong units and skewed every rebuilt row.
          // Falls back to the live price when there's no past date or the
          // historical lookup misses.
          const pastEditDate = change.buy_date && change.buy_date < todayStr ? change.buy_date : null;
          let unitPrice: number | null = null;
          let nativeCurrency: string | null = null;
          if (pastEditDate) {
            const hist = await fetchHistoricalPrice(normSym, pastEditDate);
            if (hist && hist.price > 0) {
              unitPrice = normalizePrice(hist.price, hist.currency);
              nativeCurrency = hist.currency === "GBp" ? "GBP" : hist.currency;
            }
          }
          if (unitPrice == null) {
            const priceResult = await fetchYahooPrice(normSym);
            if (priceResult.error || !priceResult.price || priceResult.price <= 0) {
              throw new ValueModeError(
                `Couldn't fetch a live price for ${existing.symbol} right now — could you state the unit count instead?`
              );
            }
            unitPrice = priceResult.price;
            nativeCurrency = priceResult.nativeCurrency;
          }

          // An untagged amount is in the user's OWN (display) currency — "put 10k
          // in" means 10k of their money, not 10k of the instrument's native
          // currency (USD for a US listing or crypto), which silently mis-scaled
          // the derived units by the FX rate.
          const statedCurrency = change.currency ?? fallbackCurrency;
          let deltaInNative: number = change.value_delta!;
          if (statedCurrency !== nativeCurrency) {
            deltaInNative = await convertCurrency(change.value_delta!, statedCurrency, nativeCurrency!);
          }

          const rawUnitsDelta = deltaInNative / unitPrice;
          const decimals = existing.type === "crypto" ? 8 : 4;
          const factor = Math.pow(10, decimals);
          const unitsDelta = Math.round(rawUnitsDelta * factor) / factor;

          // The stated amount is below the smallest tracked fraction at the
          // price — nothing to apply. Ask rather than no-op silently.
          if (unitsDelta === 0) {
            throw new ValueModeError(
              `That amount is too small to change the ${existing.name} position at the current price — could you give a larger amount, or the unit count instead?`
            );
          }

          const currentUnits = typeof existing.units === "number" ? existing.units : 0;
          const newUnits = Math.round((currentUnits + unitsDelta) * factor) / factor;

          // A sell larger than the holding would store a negative position. The
          // unit-mode validator catches stated-unit oversells; this is the
          // value-mode equivalent, which is resolved here (after validation).
          if (newUnits < 0) {
            throw new ValueModeError(
              `That's more than the current ${existing.name} position — did you mean to close it out, or sell a smaller amount?`
            );
          }

          // A value-mode sell that lands EXACTLY on zero is a full disposal, not a
          // €0 / 0-unit holding to keep. Remove the position (soft-delete + a
          // remove mutation) instead of leaving a permanent zero ghost in the
          // portfolio and holdings list. Mirrors the remove-"sold" path.
          if (newUnits === 0) {
            const saleDate = pastEditDate ?? todayStr;
            const newRunningTotal = runningTotal - toUsdSync(existing.value ?? 0, existing.currency || "USD");
            const { data: removedMutation, error: remMutErr } = await supabase.from("mutations").insert({
              user_id: userId,
              asset_id: existing.id,
              asset_name: existing.name,
              action: "remove",
              asset_type: existing.type,
              symbol: existing.symbol || null,
              before_value: existing.value,
              after_value: null,
              before_units: existing.units || null,
              after_units: null,
              currency: existing.currency || "USD",
              personal_context: change.personal_context || contextNote,
              portfolio_total: newRunningTotal,
              occurred_at: saleDate,
            }).select("id").single();
            if (remMutErr) throw remMutErr;
            const { error: remErr } = await supabase.from("assets")
              .update({ removed_at: new Date().toISOString() }).eq("id", existing.id).eq("user_id", userId);
            if (remErr) {
              console.error("EDIT→REMOVE (value-mode full disposal) ERROR:", remErr);
            } else {
              changed = true;
              runningTotal = newRunningTotal;
              considerRebuild(saleDate);
              if (removedMutation?.id) mutationMetas.push({ id: removedMutation.id, symbol: existing.symbol || null, occurredAt: saleDate, assetType: existing.type });
            }
            continue; // fully handled as a removal — skip the normal edit update
          }

          const newValue = Math.round(newUnits * unitPrice * 100) / 100;

          change.units = newUnits;
          change.value = newValue;
          change.currency = nativeCurrency!;
          delete change.value_delta;
        }

        // Cost-basis / historical-price update: a buy_date and/or buy_price edit
        // with no unit change records the basis ONLY. The position's current value
        // and units are never touched — value is always units × current market
        // price (the dashboard live-prices it). This is the guard against a basis
        // edit collapsing current value to the historical cost.
        if (isCostBasisOnlyEdit(change, existing)) {
          let historicalNative: number | null =
            typeof change.buy_price === "number" && change.buy_price > 0 ? change.buy_price : null;
          if (historicalNative == null && change.buy_date) {
            const historical = await fetchHistoricalPrice(existing.symbol!, change.buy_date);
            if (historical) historicalNative = normalizePrice(historical.price, historical.currency);
          }
          applyCostBasisOnly(change, historicalNative);
        }

        // A unit-count change on a held tradeable (buy more, trim, or correct the
        // count) states the new number of shares but never a value — the model has
        // no live price. Recompute the stored value from the new units at the live
        // price so the position value (and the mutation recorded below) stay
        // consistent with the new count, instead of keeping the old-count value
        // while units jump. Mirrors the value_delta path, which also sets both
        // units and value. A failed price lookup leaves the value untouched.
        // Presence of a units value is NOT a change: an acquisition-date fill that
        // echoes the holding's current count (same number, new buy_date) must not
        // be misread as a re-acquisition — otherwise the buy_date/buy_price writes
        // (below) and the add-mutation date back-stamp are silently skipped. Only a
        // count that actually differs from the existing lot is a real unit change.
        const editChangesUnits = typeof change.units === "number" && change.units !== (existing.units ?? null);
        if (
          editChangesUnits && isTradeable && existing.symbol &&
          change.value === undefined && !hasValueDelta
        ) {
          const priceResult = await fetchYahooPrice(normalizeCryptoSymbol(existing.symbol, existing.type));
          if (!priceResult.error && priceResult.price && priceResult.price > 0) {
            change.value = Math.round(change.units! * priceResult.price * 100) / 100;
            change.currency = priceResult.nativeCurrency;
          }
        }

        // Price-freshness check for Turn-2 edit commits (resolved units + value from a prior proposal).
        const editIsTradeable = TRADEABLE_TYPES.has(existing.type);
        const editHasResolvedUnitsAndValue =
          typeof change.units === "number" && typeof change.value === "number";
        if (
          editIsTradeable && existing.symbol && editHasResolvedUnitsAndValue &&
          (confirmedProposal ||
            (proposalTimestamp &&
              Date.now() - new Date(proposalTimestamp).getTime() > PRICE_FRESHNESS_WINDOW_MS))
        ) {
          const freshPrice = await fetchYahooPrice(normalizeCryptoSymbol(existing.symbol, existing.type));
          if (!freshPrice.error && freshPrice.price && freshPrice.price > 0) {
            const impliedPrice = change.value! / change.units!;
            const priceDiff = Math.abs(freshPrice.price - impliedPrice) / impliedPrice;
            if (priceDiff > PRICE_MOVE_THRESHOLD) {
              throw new ValueModeError(
                "The market moved while you were confirming — would you like to see updated numbers?"
              );
            }
          }
        }

        const updateData: Record<string, unknown> = {};
        if (change.new_name !== undefined && change.new_name !== existing.name) updateData.name = change.new_name;
        if (change.value !== undefined) updateData.value = change.value;
        if (change.type !== undefined) updateData.type = change.type;
        if (change.currency !== undefined) updateData.currency = change.currency;
        if (change.country !== undefined) updateData.country = change.country;
        if (change.symbol !== undefined) updateData.symbol = change.symbol;
        if (change.units !== undefined) updateData.units = change.units;
        // A unit-count change is a transaction on top of the existing lot, NOT a
        // re-acquisition: keep the position's original buy_date/buy_price anchor so
        // the "held since" date and cost basis of the shares already held survive
        // the new purchase. The transaction's own date is still recorded on the
        // edit mutation (occurred_at) below. Only a pure date/basis edit (no unit
        // change) — image-import date-fill, or an explicit "I actually bought it on
        // <date>" correction — moves the anchor.
        if (change.buy_price !== undefined && !editChangesUnits) updateData.buy_price = change.buy_price;
        if (change.buy_date !== undefined && !editChangesUnits) updateData.buy_date = change.buy_date || null;
        if (change.mortgage_balance !== undefined) {
          updateData.mortgage_balance = change.mortgage_balance;
          updateData.mortgage_balance_recorded_at = new Date().toISOString();
        }
        if (change.mortgage_rate !== undefined) updateData.mortgage_rate = change.mortgage_rate;
        if (change.monthly_payment !== undefined) updateData.monthly_payment = change.monthly_payment;
        if (change.mortgage_type !== undefined) updateData.mortgage_type = change.mortgage_type;
        // The schema advertises both mortgage dates (end date explicitly asked for
        // on interest-only), and the add path stores them — an edit stating "my
        // mortgage ends in 2040" used to silently drop the field.
        if (change.mortgage_start_date !== undefined) updateData.mortgage_start_date = change.mortgage_start_date || null;
        if (change.mortgage_end_date !== undefined) updateData.mortgage_end_date = change.mortgage_end_date || null;
        if (change.coupon_rate !== undefined) updateData.coupon_rate = change.coupon_rate;
        if (change.maturity_date !== undefined) updateData.maturity_date = normalizeMaturityDate(change.maturity_date);
        if (change.issuer !== undefined) updateData.issuer = change.issuer;
        if (change.isin !== undefined) updateData.isin = change.isin;
        if (change.address !== undefined) updateData.address = change.address;
        if (change.property_type !== undefined) updateData.property_type = change.property_type;
        if (change.size_sqm !== undefined) updateData.size_sqm = change.size_sqm;

        if (change.latitude !== undefined) updateData.latitude = change.latitude;
        if (change.longitude !== undefined) updateData.longitude = change.longitude;

        // Houses always carry a country. If this edit leaves the row a property
        // with no country set (neither stated here nor already stored), recover
        // it from the address so the location line is never blank.
        const editResultType = change.type ?? existing.type;
        const existingRE = existing as { country?: string | null; address?: string | null };
        if (
          editResultType === "real_estate" &&
          change.country === undefined &&
          !existingRE.country
        ) {
          const derived = countryFromAddress(change.address ?? existingRE.address ?? null);
          if (derived) updateData.country = derived;
        }

        // Monetary fields stay in the asset's native currency — no conversion.

        // Real-estate reclassification edit: an edit that turns a NON-property
        // asset into real_estate is a fresh property that never passed the add
        // gate, so re-validate the merged state here — otherwise it could land
        // with mortgage_balance null and render "Owned outright" uncaptured, the
        // very bug the add gate closes. Scoped to the transition, so ordinary
        // edits of an already-real_estate row are not forced to re-state anything.
        if (change.type === "real_estate" && existing.type !== "real_estate") {
          const gate = validateRealEstateChange({
            type: "real_estate",
            country: change.country ?? existing.country ?? null,
            value: change.value ?? existing.value ?? null,
            buy_price: change.buy_price ?? null,
            buy_date: change.buy_date ?? existing.buy_date ?? null,
            mortgage_balance: change.mortgage_balance ?? existing.mortgage_balance ?? null,
          });
          if (!gate.ok) throw new ValueModeError(gate.question);
        }

        // Pension edit: respect the shape, re-validate the gate over the MERGED
        // state (existing row + this change), and write shape-correct columns.
        // Income pensions keep value NULL (never NaN); switching pension_kind is
        // allowed and re-validated here.
        let pensionEditIncomeAmount: number | null = null;
        if (existing.type === "pension" || change.type === "pension") {
          const merged: PensionChangeInput = {
            type: "pension",
            pension_kind: (change.pension_kind ?? existing.pension_kind ?? "dc") as PensionKind,
            value: change.value ?? existing.value ?? null,
            currency: change.currency ?? existing.currency,
            annual_income: change.annual_income ?? existing.annual_income ?? null,
            monthly_contribution: change.monthly_contribution ?? existing.monthly_contribution ?? null,
            mortgage_rate: change.mortgage_rate ?? existing.mortgage_rate ?? null,
            access_age: change.access_age ?? existing.access_age ?? null,
            pension_provider: change.pension_provider ?? existing.pension_provider ?? null,
          };
          const gate = validatePensionChange(merged);
          if (!gate.ok) throw new ValueModeError(gate.question);
          const kind = (merged.pension_kind ?? "dc") as PensionKind;
          updateData.pension_kind = kind;
          updateData.access_age = merged.access_age ?? null;
          updateData.pension_provider =
            (typeof merged.pension_provider === "string" ? merged.pension_provider.trim() : "") || null;
          if (pensionShapeOfKind(kind) === "income") {
            updateData.value = null;
            updateData.annual_income = merged.annual_income ?? null;
            updateData.monthly_contribution = null;
            updateData.mortgage_rate = null;
            updateData.access_age = merged.access_age ?? DEFAULT_PENSION_ACCESS_AGE;
            pensionEditIncomeAmount = merged.annual_income ?? 0;
          } else {
            updateData.value = merged.value ?? null;
            updateData.annual_income = null;
            updateData.monthly_contribution = merged.monthly_contribution ?? 0;
            updateData.mortgage_rate = merged.mortgage_rate ?? null;
          }
        }

        const { error } = await supabase.from("assets").update(updateData).eq("id", existing.id).eq("user_id", userId);

        if (error) {
          console.error("EDIT ERROR:", error);
        } else {
          changed = true;
          const isIncomePensionEdit = pensionEditIncomeAmount !== null;
          const rawAfter = updateData.value !== undefined ? (updateData.value as number | null) : existing.value;
          const editCur = change.currency || existing.currency || "USD";

          // A property's Diary/Activity figure is its EQUITY (market value − mortgage
          // balance), not the raw market value. So a mortgage paydown or drawdown —
          // which moves equity but leaves the market value untouched — surfaces as
          // the change it is (e.g. "+€10,000") instead of a zero-delta no-op the
          // journal and the property's own Activity list both hid (both derive the
          // shown delta from after_value − before_value). For a plain revaluation
          // (mortgage unchanged) equity moves exactly with value, so appreciation
          // still reads identically. Non-real-estate assets keep the raw value
          // (existing.value may be null for an income pension — preserved as-is).
          const isRealEstateEdit = existing.type === "real_estate";
          const oldMortgage = existing.mortgage_balance ?? 0;
          const newMortgage = updateData.mortgage_balance !== undefined
            ? (updateData.mortgage_balance as number)
            : oldMortgage;
          const beforeRecorded: number | null = isRealEstateEdit ? realEstateEquity(existing.value ?? 0, oldMortgage) : existing.value;
          const afterRecorded: number | null = isRealEstateEdit ? realEstateEquity(rawAfter ?? 0, newMortgage) : rawAfter;

          // Income pensions are off-balance — their net-worth contribution is 0,
          // so the running total never picks up an annual-income figure. Capital
          // pensions and all other assets use the resolved value (equity for
          // real estate).
          const afterValueForTotal = isIncomePensionEdit ? 0 : (afterRecorded ?? 0);
          runningTotal += toUsdSync(afterValueForTotal, editCur) - toUsdSync(beforeRecorded ?? 0, existing.currency || "USD");
          // The mutation records the annual income for income pensions (phrased
          // "€X / year" downstream), equity for real estate, the resolved value
          // otherwise.
          const afterValue: number | null = isIncomePensionEdit ? pensionEditIncomeAmount : afterRecorded;
          // An income-pension edit must NOT pair the old CAPITAL pot value against
          // the new annual-INCOME after_value — they are different quantities (a
          // balance vs a yearly flow), and the Diary/Activity would subtract them
          // into a nonsense "/year" delta (e.g. a €50k pot reclassified to €12k/yr
          // rendered "−€38,000 / year"). Store the PRIOR annual income instead: a
          // raise then reads "+€X / year", and a capital→income reclassification —
          // which had no prior income — reads as a neutral restatement of the new
          // entitlement. The running total above still uses beforeRecorded, so the
          // old pot is correctly removed from net worth. Non-income edits are
          // unchanged (equity for real estate, resolved value otherwise).
          const storedBeforeValue: number | null = isIncomePensionEdit
            ? (existing.annual_income ?? null)
            : beforeRecorded;

          const onlyNameChanged = Object.keys(updateData).length === 1 && updateData.name !== undefined;
          const afterUnitsResolved = change.units !== undefined ? change.units : (existing.units || null);

          if (change.correction) {
            // DATA CORRECTION — the stored figure was WRONG, not a new event.
            // Leave no trace: write NO edit mutation (so no "Recorded a new
            // valuation" row appears in the Journal) and instead rewrite the
            // acquisition ("add") record in place so the history graph — which
            // is rebuilt from the mutation timeline — reads as if the corrected
            // figure had always been true. The asset row is already updated
            // above; the running total already reflects the corrected value.
            const addFix: Record<string, unknown> = { after_value: afterValue };
            if (afterUnitsResolved !== null) addFix.after_units = afterUnitsResolved;
            if (change.new_name) addFix.asset_name = change.new_name;
            if (change.currency) addFix.currency = change.currency;
            // A corrected acquisition date moves the whole timeline anchor.
            if (change.buy_date) addFix.occurred_at = change.buy_date;
            const { error: addFixErr } = await supabase.from("mutations")
              .update(addFix)
              .eq("user_id", userId)
              .eq("asset_id", existing.id)
              .eq("action", "add");
            if (addFixErr) console.error("EDIT (correction) add-record rewrite ERROR:", addFixErr);
            // Recompute the graph from the acquisition forward so every point
            // that showed the wrong figure is redrawn with the corrected one.
            // A pure rename touches no figure, so it needs no rebuild.
            if (!onlyNameChanged) {
              considerRebuild(change.buy_date ?? existing.buy_date ?? (existing.created_at ? existing.created_at.slice(0, 10) : null));
            }
          } else {
            // Every edit is logged — including a pure rename, which records the
            // before/after name (value/units unchanged) so the Diary audit trail
            // is complete. Market-context backfill is skipped for renames.
            const renameNote = onlyNameChanged ? `Renamed ${existing.name} to ${change.new_name}.` : null;
            // A mortgage-only move shows the same "+€X" shape as appreciation, so when
            // the user left no note of their own, tag what actually happened — this is
            // what makes a paydown legible as a paydown in the Diary/Activity.
            const mortgageMoved = isRealEstateEdit && updateData.mortgage_balance !== undefined && newMortgage !== oldMortgage;
            const mortgageNote = mortgageMoved
              ? (newMortgage < oldMortgage ? "Paid down the mortgage." : "Increased the mortgage.")
              : null;
            const editOccurredAt = change.buy_date || new Date().toISOString().split("T")[0];
            const { data: editedMutation, error: editMutError } = await supabase.from("mutations").insert({
              user_id: userId,
              asset_id: existing.id,
              asset_name: change.new_name || name,
              action: "edit",
              asset_type: existing.type,
              symbol: existing.symbol || null,
              before_value: storedBeforeValue,
              after_value: afterValue,
              before_units: existing.units || null,
              after_units: afterUnitsResolved,
              currency: change.currency || existing.currency || "USD",
              personal_context: change.personal_context || contextNote || renameNote || mortgageNote,
              portfolio_total: runningTotal,
              occurred_at: editOccurredAt,
            }).select("id").single();
            // The asset update already committed; a failed mutation insert leaves
            // an audit-trail gap (no Diary row for this edit) rather than corrupt
            // state, so surface it for monitoring but don't undo the edit.
            if (editMutError) console.error("EDIT MUTATION ERROR (edit applied, audit row missing):", editMutError);
            if (editedMutation?.id && !onlyNameChanged) {
              mutationMetas.push({ id: editedMutation.id, symbol: existing.symbol || null, occurredAt: editOccurredAt, assetType: existing.type });
              // Record the property's mortgage balance AFTER this edit, so a paydown
              // or drawdown becomes a step the net-worth history can honour.
              if (isRealEstateEdit && editedMutation?.id) {
                await stampMortgageBalance(supabase, editedMutation.id, newMortgage);
              }
            }

            // Image-import workflow: the batch is committed (action "add",
            // occurred_at = today, since the acquisition date isn't known yet)
            // BEFORE the model asks "when did you start holding most of these?"
            // — the answer then arrives as an "edit" carrying buy_date. That's
            // the position's REAL acquisition date, so retroactively stamp the
            // asset's original "add" mutation with it — exactly the basis the
            // single-add path uses up front (line ~442) — so the period delta
            // and backfill key off when the holding was actually acquired, not
            // when the row happened to be imported.
            // Gated on !editChangesUnits: this only fires for a pure date-fill edit
            // (units unchanged). A buy-more edit carries its own later transaction
            // date, which must NOT be back-stamped onto the original acquisition.
            if (change.buy_date && !editChangesUnits) {
              await supabase.from("mutations")
                .update({ occurred_at: change.buy_date })
                .eq("user_id", userId)
                .eq("asset_id", existing.id)
                .eq("action", "add");
            }
          }
        }
      } else {
        // The named asset isn't in the portfolio — surface a clear error instead
        // of silently no-opping (which left no feedback and no mutation row).
        throw new ValueModeError(
          `I couldn't find "${name}" in your portfolio to edit. Could you check the name?`
        );
      }

    } else if (action === "remove") {
      // Two intents (see PortfolioChange.removal_reason):
      //   "sold"    — a real disposal. Soft-delete (removed_at) and write a
      //               remove mutation dated to the sale, so backfill keeps
      //               reconstructing the position as held up to that date and
      //               zero after. History up to the sale is preserved.
      //   "mistake" — a data correction: the position never belonged here. Erase
      //               it and EVERY trace it left — the asset row(s), all their
      //               journal mutations, and its footprint in the graph — so a
      //               correction records nothing (see the mistake block below).
      // Default is "sold" (non-destructive — data is preserved; a mistake can
      // still be corrected later, but erased history can't be recovered).
      // A remove flagged as a correction is a mistake erase (never a "sold"
      // disposal) — a correction must leave no trace, so it can't degrade to the
      // history-preserving soft-delete.
      const reason = (change.removal_reason === "mistake" || change.correction) ? "mistake" : "sold";
      const saleDate = resolveAcquisitionDate(change.sell_date) ?? todayStr;
      const nameKey = name.toLowerCase();

      if (reason === "mistake") {
        // A correction must leave NOTHING behind — no journal row, no graph
        // point. Crucially it has to reach a soft-removed row too: a user who
        // first said "sold" (a soft-delete that keeps the row + writes a remove
        // mutation) and then "actually that was a mistake" would otherwise be
        // told "done" while the row and its journal entries silently survived —
        // they're absent from currentAssets, which excludes removed_at rows. So
        // query the DB directly for every asset row under this name/symbol,
        // whatever its removed state.
        const { data: allRows } = await supabase
          .from("assets")
          .select("id, name, symbol, type, value, currency, mortgage_balance, buy_date, created_at, removed_at")
          .eq("user_id", userId);
        const assetRows = (allRows || []).filter(
          (a) => (a.name && a.name.toLowerCase() === nameKey) ||
                 (a.symbol && a.symbol.toLowerCase() === nameKey)
        );

        // Every journal row it ever produced — matched by asset_id AND by
        // name/symbol, so nothing is missed: a mutation still linked to one of
        // the rows above, an orphan left by an earlier hard-delete (asset_id
        // nulled), or a stale row naming the holding directly. These are the
        // entries the user sees in the Journal.
        const assetIdSet = new Set(assetRows.map((a) => a.id));
        const { data: allMuts } = await supabase
          .from("mutations")
          .select("id, asset_id, asset_name, symbol, occurred_at, recorded_at")
          .eq("user_id", userId);
        const mutationRows = (allMuts || []).filter(
          (m) => (m.asset_id && assetIdSet.has(m.asset_id)) ||
                 (m.asset_name && m.asset_name.toLowerCase() === nameKey) ||
                 (m.symbol && m.symbol.toLowerCase() === nameKey)
        );

        if (assetRows.length === 0 && mutationRows.length === 0) {
          // Nothing under this name to correct — say so honestly rather than
          // report a phantom "done" (the false-success the user hit before).
          throw new ValueModeError(
            `I couldn't find "${name}" in your portfolio or its history to remove. Could you check the name?`
          );
        }

        // Rebuild every graph point back to the earliest date this holding
        // touched — its acquisition, and any dated mutation (a past-dated
        // sale/edit) — so each row that once counted it is recomputed without it.
        for (const a of assetRows) {
          considerRebuild(a.buy_date ?? (a.created_at ? a.created_at.slice(0, 10) : null));
        }
        for (const m of mutationRows) {
          considerRebuild((m.occurred_at ?? m.recorded_at)?.slice(0, 10) ?? null);
        }

        // Drop the journal rows first (no remove mutation is written — a
        // correction is not a financial event), then the asset rows themselves.
        if (mutationRows.length > 0) {
          const { error: mErr } = await supabase
            .from("mutations")
            .delete()
            .eq("user_id", userId)
            .in("id", mutationRows.map((m) => m.id));
          if (mErr) console.error("REMOVE (mistake) mutations ERROR:", mErr);
          else changed = true;
        }
        for (const a of assetRows) {
          // Deleting a still-held row takes its value out of net worth; a
          // soft-removed row already left it, so only adjust for live rows.
          if (!a.removed_at) {
            const contribution = a.type === "real_estate"
              ? realEstateEquity(a.value, a.mortgage_balance)
              : a.value;
            runningTotal = runningTotal - toUsdSync(contribution, a.currency || "USD");
          }
          const { error } = await supabase.from("assets").delete().eq("id", a.id).eq("user_id", userId);
          if (error) console.error("REMOVE (mistake) ERROR:", error);
          else changed = true;
        }
        continue;
      }

      const matching = currentAssets.filter(
        (a) => a.name.toLowerCase() === nameKey ||
               (a.symbol && a.symbol.toLowerCase() === nameKey)
      );

      for (const existing of matching) {
        // Match how computeNetWorth counted this asset: equity for real estate, value for others.
        const existingContribution = existing.type === "real_estate"
          ? realEstateEquity(existing.value, existing.mortgage_balance)
          : existing.value;
        const newRunningTotal = runningTotal - toUsdSync(existingContribution, existing.currency || "USD");
        // An income (db/state) pension carries a null value, so its removal would
        // record before_value = null and (pre-hasContent-fix) leave no journal row.
        // Record the annual entitlement given up so the event is legible.
        const isIncomePensionRemove = existing.type === "pension" && (existing.pension_kind === "db" || existing.pension_kind === "state");
        const removeBeforeValue = isIncomePensionRemove ? (existing.annual_income ?? null) : existingContribution;

        // sold: INSERT the remove mutation (asset_id preserved — soft-delete
        // keeps the row, so asset_id never nulls out), then mark removed_at.
        const { error: mutationError, data: removedMutation } = await supabase.from("mutations").insert({
          user_id: userId,
          asset_id: existing.id,
          asset_name: existing.name,
          action: "remove",
          asset_type: existing.type,
          symbol: existing.symbol || null,
          // The removal's displayed magnitude (struck-through in the Diary, the
          // "▼" impact in the Overview) is read straight from before_value, so it
          // must be the EQUITY that actually leaves net worth — not the gross
          // market value, which overstated a mortgaged-property sale by the whole
          // loan and contradicted this row's own equity-based portfolio_total.
          before_value: removeBeforeValue,
          after_value: null,
          before_units: existing.units || null,
          after_units: null,
          currency: existing.currency || "EUR",
          personal_context: change.personal_context || contextNote,
          portfolio_total: newRunningTotal,
          occurred_at: saleDate,
        }).select("id").single();

        if (mutationError) throw mutationError;
        if (removedMutation?.id) {
          mutationMetas.push({ id: removedMutation.id, symbol: existing.symbol || null, occurredAt: saleDate, assetType: existing.type });
        }

        const { error } = await supabase
          .from("assets")
          .update({ removed_at: new Date().toISOString() })
          .eq("id", existing.id);

        if (error) {
          console.error("REMOVE (sold) ERROR:", error);
        } else {
          changed = true;
          runningTotal = newRunningTotal;
          // A sale dated in the past changes [saleDate, today) — rebuild it.
          // A sale today changes only today's row (writeSnapshot owns it).
          considerRebuild(saleDate);
        }
      }
    }
    } catch (err) {
      // Single-row batches rethrow so callers can surface the specific
      // message (e.g. the value-mode "market moved" / "couldn't fetch price"
      // ValueModeError on a confirm turn). Multi-row batches collect the
      // failure and continue, so one bad row never blocks the others.
      if (changes.length === 1) throw err;
      failures.push({ name, reason: err instanceof Error ? err.message : String(err), clarification: err instanceof ValueModeError });
    }
  }

  return { changed, duplicateWarnings, fxWarnings, mutationMetas, failures, rebuildFrom };
}

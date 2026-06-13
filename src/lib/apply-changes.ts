import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchHistoricalPrice, normalizePrice } from "./prices";
import { fetchPriceWithFallback, fetchYahooPrice, fetchYahooQuote } from "./prices-server";
import { resolveSymbol, normalizeCryptoSymbol } from "./symbol-aliases";
import { computeNetWorth } from "./utils";
import { getUsdRates } from "./fx";
import { countryToCurrency } from "./country-currency";
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

const TRADEABLE_TYPES = new Set(["stocks", "etf", "crypto", "gold"]);

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

type PortfolioChange = {
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
async function convertCurrency(amount: number, from: string, to: string): Promise<number> {
  if (from === to) return amount;
  const rates = await getUsdRates();
  const fromRate = from === "USD" ? 1 : (rates[from] ?? 1);
  const toRate   = to   === "USD" ? 1 : (rates[to]   ?? 1);
  return (amount / fromRate) * toRate;
}

export type MutationMeta = {
  id: string;
  symbol: string | null;
  occurredAt: string;
  assetType: string | null;
};

export async function applyPortfolioChanges({
  supabase,
  userId,
  changes,
  currentAssets,
  contextNote,
  proposalTimestamp,
}: {
  supabase: SupabaseClient;
  userId: string;
  changes: PortfolioChange[];
  currentAssets: CurrentAsset[];
  contextNote: string | null;
  proposalTimestamp?: string | null;
}): Promise<{ changed: boolean; duplicateWarnings: string[]; fxWarnings: string[]; mutationMetas: MutationMeta[]; failures: { name: string; reason: string }[]; rebuildFrom: string | null }> {
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
  const failures: { name: string; reason: string }[] = [];
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

  // Alias-resolve symbols synchronously before any I/O (e.g. TL0.DE → TSLA)
  const aliasedSymbols = changes.map((change) =>
    change.action === "add" && change.symbol ? resolveSymbol(change.symbol) : null
  );

  // Pre-resolve venue-qualified symbols for add ops, in parallel
  const resolvedSymbols = await Promise.all(
    changes.map(async (change, i) => {
      const sym = aliasedSymbols[i];
      if (change.action === "add" && sym) {
        const normalizedSym = normalizeCryptoSymbol(sym, change.type);
        const result = await fetchPriceWithFallback(normalizedSym, change.country);
        if (!result.error) return { symbol: result.symbol, nativeCurrency: result.nativeCurrency };
      }
      return null;
    })
  );

  // Pre-resolve prices for add ops that need auto-fill, in parallel. `value`
  // (current market value) and `buy_price` (cost basis) come from separate
  // lookups: buy_price is the price AT buy_date (or "now" if unstated), while
  // value is units x the LATEST market price — never the buy_date price, which
  // would set value to cost basis instead of market.
  const resolvedPrices = await Promise.all(
    changes.map(async (change, i) => {
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
      return null;
    })
  );

  // Fetch canonical names from Yahoo for tradeable adds, in parallel
  const resolvedNames = await Promise.all(
    changes.map(async (change, i) => {
      if (change.action === "add" && change.symbol && TRADEABLE_TYPES.has(change.type ?? "")) {
        const effectiveSymbol = resolvedSymbols[i]?.symbol ?? aliasedSymbols[i] ?? change.symbol;
        const quote = await fetchYahooQuote(effectiveSymbol);
        const resolved = (quote.longName ?? quote.shortName ?? "").trim();
        return resolved || null;
      }
      return null;
    })
  );

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const { action, name } = change;

    if (!name?.trim()) continue;

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
      const effectiveSymbol = resolvedSymbols[i]?.symbol ?? aliasedSymbols[i] ?? change.symbol ?? null;

      const isDuplicate = effectiveSymbol
        ? currentAssets.some((a) => a.symbol && a.symbol.toLowerCase() === effectiveSymbol.toLowerCase())
        : currentAssets.some((a) => a.name.trim().toLowerCase() === resolvedAssetName.trim().toLowerCase());

      if (isDuplicate) {
        const id = effectiveSymbol ? effectiveSymbol.toUpperCase() : `"${resolvedAssetName}"`;
        duplicateWarnings.push(
          `${id} already exists in your portfolio. If you want to update the existing position, ask me to edit it — or give the new entry a different name to keep both.`
        );
        continue;
      }

      let resolvedValue = change.value || 0;
      let resolvedBuyPrice: number | null = change.buy_price || null;
      const isRealEstate = (change.type || "other") === "real_estate";

      // For real estate, derive native currency from country when Claude omits it.
      // For tradeables, Yahoo overrides this below. Other types default to USD.
      let resolvedCurrency = change.currency || (
        isRealEstate ? countryToCurrency(change.country) : "USD"
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

      if (isTradeable && effectiveSymbol && !hasUnits && hasValue) {
        const priceResult = await fetchYahooPrice(effectiveSymbol);

        if (priceResult.error || !priceResult.price || priceResult.price <= 0) {
          throw new ValueModeError(
            `Couldn't fetch a live price for ${effectiveSymbol} right now — could you state the unit count instead?`
          );
        }

        const statedCurrency = change.currency ?? priceResult.nativeCurrency;
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

        change.units = derivedUnits;
        change.value = derivedValue;
        change.currency = priceResult.nativeCurrency;
        resolvedValue = derivedValue;
        resolvedCurrency = priceResult.nativeCurrency;
        // buy_price intentionally omitted — this is "at market price", not a basis declaration.
      }

      // Price-freshness check for Turn-2 commits (resolved units + value from a prior proposal).
      // Only runs when the proposal is stale (> PRICE_FRESHNESS_WINDOW_MS) and the change has
      // both units and value (the shape Claude emits on Turn 2 after confirming a proposal).
      if (
        isTradeable && effectiveSymbol && hasUnits && hasValue &&
        proposalTimestamp &&
        Date.now() - new Date(proposalTimestamp).getTime() > PRICE_FRESHNESS_WINDOW_MS
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
          country: change.country ?? null,
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
        country: change.country || null,
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
        changed = true;
        runningTotal += toUsdSync(resolvedValue, resolvedCurrency);
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
        const { data: addedMutation } = await supabase.from("mutations").insert({
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
          portfolio_total: runningTotal,
          occurred_at: addOccurredAt,
        }).select("id").single();
        if (addedMutation?.id) {
          mutationMetas.push({ id: addedMutation.id, symbol: effectiveSymbol, occurredAt: addOccurredAt, assetType: change.type || "other" });
        }
      }

    } else if (action === "edit") {
      const existing = currentAssets.find(
        (a) => a.name.toLowerCase() === name.toLowerCase() ||
               (a.symbol && a.symbol.toLowerCase() === name.toLowerCase())
      );

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

          const priceResult = await fetchYahooPrice(normalizeCryptoSymbol(existing.symbol, existing.type));

          if (priceResult.error || !priceResult.price || priceResult.price <= 0) {
            throw new ValueModeError(
              `Couldn't fetch a live price for ${existing.symbol} right now — could you state the unit count instead?`
            );
          }

          const statedCurrency = change.currency ?? existing.currency ?? priceResult.nativeCurrency;
          let deltaInYahooCurrency: number = change.value_delta!;
          if (statedCurrency !== priceResult.nativeCurrency) {
            deltaInYahooCurrency = await convertCurrency(
              change.value_delta!,
              statedCurrency,
              priceResult.nativeCurrency,
            );
          }

          const rawUnitsDelta = deltaInYahooCurrency / priceResult.price;
          const decimals = existing.type === "crypto" ? 8 : 4;
          const factor = Math.pow(10, decimals);
          const unitsDelta = Math.round(rawUnitsDelta * factor) / factor;

          const currentUnits = typeof existing.units === "number" ? existing.units : 0;
          const newUnits = Math.round((currentUnits + unitsDelta) * factor) / factor;

          const newValue = Math.round(newUnits * priceResult.price * 100) / 100;

          change.units = newUnits;
          change.value = newValue;
          change.currency = priceResult.nativeCurrency;
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

        // Price-freshness check for Turn-2 edit commits (resolved units + value from a prior proposal).
        const editIsTradeable = TRADEABLE_TYPES.has(existing.type);
        const editHasResolvedUnitsAndValue =
          typeof change.units === "number" && typeof change.value === "number";
        if (
          editIsTradeable && existing.symbol && editHasResolvedUnitsAndValue &&
          proposalTimestamp &&
          Date.now() - new Date(proposalTimestamp).getTime() > PRICE_FRESHNESS_WINDOW_MS
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
        if (change.buy_price !== undefined) updateData.buy_price = change.buy_price;
        if (change.buy_date !== undefined) updateData.buy_date = change.buy_date || null;
        if (change.mortgage_balance !== undefined) {
          updateData.mortgage_balance = change.mortgage_balance;
          updateData.mortgage_balance_recorded_at = new Date().toISOString();
        }
        if (change.mortgage_rate !== undefined) updateData.mortgage_rate = change.mortgage_rate;
        if (change.monthly_payment !== undefined) updateData.monthly_payment = change.monthly_payment;
        if (change.mortgage_type !== undefined) updateData.mortgage_type = change.mortgage_type;
        if (change.coupon_rate !== undefined) updateData.coupon_rate = change.coupon_rate;
        if (change.maturity_date !== undefined) updateData.maturity_date = normalizeMaturityDate(change.maturity_date);
        if (change.issuer !== undefined) updateData.issuer = change.issuer;
        if (change.isin !== undefined) updateData.isin = change.isin;
        if (change.address !== undefined) updateData.address = change.address;
        if (change.property_type !== undefined) updateData.property_type = change.property_type;
        if (change.size_sqm !== undefined) updateData.size_sqm = change.size_sqm;

        if (change.latitude !== undefined) updateData.latitude = change.latitude;
        if (change.longitude !== undefined) updateData.longitude = change.longitude;

        // Monetary fields stay in the asset's native currency — no conversion.

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

        const { error } = await supabase.from("assets").update(updateData).eq("id", existing.id);

        if (error) {
          console.error("EDIT ERROR:", error);
        } else {
          changed = true;
          const isIncomePensionEdit = pensionEditIncomeAmount !== null;
          const rawAfter = updateData.value !== undefined ? (updateData.value as number | null) : existing.value;
          const editCur = change.currency || existing.currency || "USD";
          // Income pensions are off-balance — their net-worth contribution is 0,
          // so the running total never picks up an annual-income figure. Capital
          // pensions and all other assets use the resolved value.
          const afterValueForTotal = isIncomePensionEdit ? 0 : (rawAfter ?? 0);
          runningTotal += toUsdSync(afterValueForTotal, editCur) - toUsdSync(existing.value ?? 0, existing.currency || "USD");
          // The mutation records the annual income for income pensions (phrased
          // "€X / year" downstream), the resolved value otherwise.
          const afterValue: number | null = isIncomePensionEdit ? pensionEditIncomeAmount : rawAfter;

          // Every edit is logged — including a pure rename, which records the
          // before/after name (value/units unchanged) so the Diary audit trail
          // is complete. Market-context backfill is skipped for renames.
          const onlyNameChanged = Object.keys(updateData).length === 1 && updateData.name !== undefined;
          const renameNote = onlyNameChanged ? `Renamed ${existing.name} to ${change.new_name}.` : null;
          const editOccurredAt = change.buy_date || new Date().toISOString().split("T")[0];
          const { data: editedMutation } = await supabase.from("mutations").insert({
            user_id: userId,
            asset_id: existing.id,
            asset_name: change.new_name || name,
            action: "edit",
            asset_type: existing.type,
            symbol: existing.symbol || null,
            before_value: existing.value,
            after_value: afterValue,
            before_units: existing.units || null,
            after_units: change.units !== undefined ? change.units : (existing.units || null),
            currency: change.currency || existing.currency || "USD",
            personal_context: change.personal_context || contextNote || renameNote,
            portfolio_total: runningTotal,
            occurred_at: editOccurredAt,
          }).select("id").single();
          if (editedMutation?.id && !onlyNameChanged) {
            mutationMetas.push({ id: editedMutation.id, symbol: existing.symbol || null, occurredAt: editOccurredAt, assetType: existing.type });
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
          if (change.buy_date) {
            await supabase.from("mutations")
              .update({ occurred_at: change.buy_date })
              .eq("user_id", userId)
              .eq("asset_id", existing.id)
              .eq("action", "add");
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
      //   "mistake" — the position never belonged here. Hard-delete the row
      //               AND its mutations so backfill can't reconstruct it, then
      //               rebuild from its acquisition so it vanishes everywhere.
      // Default is "sold" (non-destructive — data is preserved; a mistake can
      // still be corrected later, but erased history can't be recovered).
      const reason = change.removal_reason === "mistake" ? "mistake" : "sold";
      const saleDate = resolveAcquisitionDate(change.sell_date) ?? todayStr;

      const matching = currentAssets.filter(
        (a) => a.name.toLowerCase() === name.toLowerCase() ||
               (a.symbol && a.symbol.toLowerCase() === name.toLowerCase())
      );

      for (const existing of matching) {
        // Match how computeNetWorth counted this asset: equity for real estate, value for others.
        const existingContribution = existing.type === "real_estate"
          ? existing.value - (existing.mortgage_balance ?? 0)
          : existing.value;
        const newRunningTotal = runningTotal - toUsdSync(existingContribution, existing.currency || "USD");

        if (reason === "mistake") {
          // Erase from history: drop the asset's mutations (so backfill's unit
          // timeline / acquisition map no longer see it) then hard-delete the
          // row. No remove mutation is written — this was not a financial event.
          // Rebuild from acquisition so every row that falsely included it is
          // recomputed without it.
          considerRebuild(existing.buy_date ?? (existing.created_at ? existing.created_at.slice(0, 10) : null));
          await supabase.from("mutations").delete().eq("user_id", userId).eq("asset_id", existing.id);
          const { error } = await supabase.from("assets").delete().eq("id", existing.id);
          if (error) {
            console.error("REMOVE (mistake) ERROR:", error);
          } else {
            changed = true;
            runningTotal = newRunningTotal;
          }
          continue;
        }

        // sold: INSERT the remove mutation (asset_id preserved — soft-delete
        // keeps the row, so asset_id never nulls out), then mark removed_at.
        const { error: mutationError, data: removedMutation } = await supabase.from("mutations").insert({
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
      failures.push({ name, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return { changed, duplicateWarnings, fxWarnings, mutationMetas, failures, rebuildFrom };
}

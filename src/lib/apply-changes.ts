import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchHistoricalPrice, normalizePrice } from "./prices";
import { fetchPriceWithFallback, fetchYahooPrice, fetchYahooQuote } from "./prices-server";
import { resolveSymbol, normalizeCryptoSymbol } from "./symbol-aliases";
import { computeNetWorth } from "./utils";
import { getUsdRates } from "./fx";
import { countryToCurrency } from "./country-currency";

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
  buy_price_source?: string;
  mortgage_balance?: number;
  mortgage_rate?: number;
  monthly_payment?: number;
  mortgage_type?: string;
  mortgage_start_date?: string;
  mortgage_end_date?: string;
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
}): Promise<{ changed: boolean; duplicateWarnings: string[]; fxWarnings: string[]; mutationMetas: MutationMeta[] }> {
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
  let changed = false;

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

  // Pre-resolve historical prices for add ops that need auto-fill, in parallel
  const resolvedPrices = await Promise.all(
    changes.map(async (change, i) => {
      if (change.action === "add" && (change.value || 0) === 0 && change.symbol && change.units) {
        const effectiveSymbol = resolvedSymbols[i]?.symbol ?? aliasedSymbols[i] ?? change.symbol;
        const priceData = await fetchHistoricalPrice(effectiveSymbol, change.buy_date || null);
        if (priceData) {
          const p = normalizePrice(priceData.price, priceData.currency);
          return {
            value: Math.round(p * change.units!),
            buyPrice: Math.round(p * 100) / 100,
            yahooCurrency: priceData.currency === "GBp" ? "GBP" : priceData.currency,
          };
        }
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
      let resolvedMortgageBalance = change.mortgage_balance ?? null;
      let resolvedMonthlyPayment = change.monthly_payment ?? null;

      const resolvedLat: number | null = change.latitude ?? null;
      const resolvedLng: number | null = change.longitude ?? null;

      const { data: inserted, error } = await supabase.from("assets").insert({
        name: resolvedAssetName,
        type: change.type || "other",
        value: resolvedValue,
        currency: resolvedCurrency,
        country: change.country || null,
        symbol: effectiveSymbol,
        units: change.units || null,
        buy_price: resolvedBuyPrice,
        buy_date: change.buy_date || null,
        buy_price_source: change.buy_price_source || null,
        mortgage_balance: resolvedMortgageBalance,
        mortgage_balance_recorded_at: resolvedMortgageBalance != null ? new Date().toISOString() : null,
        mortgage_rate: change.mortgage_rate ?? null,
        monthly_payment: resolvedMonthlyPayment,
        mortgage_type: change.mortgage_type || null,
        mortgage_start_date: change.mortgage_start_date || null,
        mortgage_end_date: change.mortgage_end_date || null,
        address: change.address || null,
        property_type: change.property_type || null,
        size_sqm: change.size_sqm || null,
        latitude: resolvedLat,
        longitude: resolvedLng,
        user_id: userId,
      }).select("id").single();

      if (error) {
        console.error("ADD ERROR:", error);
      } else {
        changed = true;
        runningTotal += toUsdSync(resolvedValue, resolvedCurrency);
        const addOccurredAt = change.buy_date || new Date().toISOString().split("T")[0];
        const { data: addedMutation } = await supabase.from("mutations").insert({
          user_id: userId,
          asset_id: inserted?.id || null,
          asset_name: resolvedAssetName,
          action: "add",
          asset_type: change.type || "other",
          symbol: effectiveSymbol,
          after_value: resolvedValue,
          before_units: null,
          after_units: change.units || null,
          currency: resolvedCurrency,
          personal_context: change.personal_context || contextNote,
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

        // Historical re-derivation: edit with value + buy_date, no units, no value_delta.
        // Fires when the user provides a historical buy_date after a value-mode add — the units
        // recorded at today's price must be recomputed at the stated historical price.
        const editHasAbsoluteValue = typeof change.value === "number" && change.value > 0;
        if (!hasValueDelta && !editHasUnits && editHasAbsoluteValue && change.buy_date && isTradeable && existing.symbol) {
          const historical = await fetchHistoricalPrice(existing.symbol, change.buy_date);
          if (historical) {
            const p = normalizePrice(historical.price, historical.currency);
            const decimals = existing.type === "crypto" ? 8 : 4;
            const factor = Math.pow(10, decimals);
            const derivedUnits = Math.round((change.value! / p) * factor) / factor;
            const derivedValue = Math.round(derivedUnits * p * 100) / 100;
            change.units = derivedUnits;
            change.value = derivedValue;
            change.buy_price = Math.round(p * 100) / 100;
            change.currency = historical.currency === "GBp" ? "GBP" : historical.currency;
          }
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
        if (change.buy_date !== undefined) updateData.buy_date = change.buy_date;
        if (change.mortgage_balance !== undefined) {
          updateData.mortgage_balance = change.mortgage_balance;
          updateData.mortgage_balance_recorded_at = new Date().toISOString();
        }
        if (change.mortgage_rate !== undefined) updateData.mortgage_rate = change.mortgage_rate;
        if (change.monthly_payment !== undefined) updateData.monthly_payment = change.monthly_payment;
        if (change.mortgage_type !== undefined) updateData.mortgage_type = change.mortgage_type;
        if (change.address !== undefined) updateData.address = change.address;
        if (change.property_type !== undefined) updateData.property_type = change.property_type;
        if (change.size_sqm !== undefined) updateData.size_sqm = change.size_sqm;

        if (change.latitude !== undefined) updateData.latitude = change.latitude;
        if (change.longitude !== undefined) updateData.longitude = change.longitude;

        // Monetary fields stay in the asset's native currency — no conversion.

        const { error } = await supabase.from("assets").update(updateData).eq("id", existing.id);

        if (error) {
          console.error("EDIT ERROR:", error);
        } else {
          changed = true;
          const afterValue = updateData.value !== undefined ? (updateData.value as number) : existing.value;
          const editCur = change.currency || existing.currency || "USD";
          runningTotal += toUsdSync(afterValue, editCur) - toUsdSync(existing.value, existing.currency || "USD");

          const onlyNameChanged = Object.keys(updateData).length === 1 && updateData.name !== undefined;
          if (!onlyNameChanged) {
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
              personal_context: change.personal_context || contextNote,
              portfolio_total: runningTotal,
              occurred_at: editOccurredAt,
            }).select("id").single();
            if (editedMutation?.id) {
              mutationMetas.push({ id: editedMutation.id, symbol: existing.symbol || null, occurredAt: editOccurredAt, assetType: existing.type });
            }
          }
        }
      }

    } else if (action === "remove") {
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

        // INSERT the mutation row while asset_id still exists, then DELETE.
        // mutations.asset_id is ON DELETE SET NULL, so it nulls out post-delete and the row persists.
        const removeOccurredAt = new Date().toISOString().split("T")[0];
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
          occurred_at: removeOccurredAt,
        }).select("id").single();

        if (mutationError) throw mutationError;
        if (removedMutation?.id) {
          mutationMetas.push({ id: removedMutation.id, symbol: existing.symbol || null, occurredAt: removeOccurredAt, assetType: existing.type });
        }

        const { error } = await supabase.from("assets").delete().eq("id", existing.id);

        if (error) {
          console.error("REMOVE ERROR:", error);
        } else {
          changed = true;
          runningTotal = newRunningTotal;
        }
      }
    }
  }

  return { changed, duplicateWarnings, fxWarnings, mutationMetas };
}

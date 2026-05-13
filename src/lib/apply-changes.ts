import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchHistoricalPrice, normalizePrice } from "./prices";
import { computeNetWorth } from "./utils";
import { toEur } from "./fx";
import { countryToCurrency } from "./country-currency";

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
};

export async function applyPortfolioChanges({
  supabase,
  userId,
  changes,
  currentAssets,
  contextNote,
}: {
  supabase: SupabaseClient;
  userId: string;
  changes: PortfolioChange[];
  currentAssets: CurrentAsset[];
  contextNote: string | null;
}): Promise<{ changed: boolean; duplicateWarnings: string[]; fxWarnings: string[] }> {
  let runningTotal = computeNetWorth(currentAssets);
  const duplicateWarnings: string[] = [];
  const fxWarnings: string[] = [];
  let changed = false;

  // Pre-resolve historical prices for add ops that need auto-fill, in parallel
  const resolvedPrices = await Promise.all(
    changes.map(async (change) => {
      if (change.action === "add" && (change.value || 0) === 0 && change.symbol && change.units) {
        const priceData = await fetchHistoricalPrice(change.symbol, change.buy_date || null);
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

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const { action, name } = change;

    if (!name?.trim()) continue;

    if (action === "add") {
      const isDuplicate = change.symbol
        ? currentAssets.some((a) => a.symbol && a.symbol.toLowerCase() === change.symbol!.toLowerCase())
        : currentAssets.some((a) => a.name.trim().toLowerCase() === name.trim().toLowerCase());

      if (isDuplicate) {
        const id = change.symbol ? change.symbol.toUpperCase() : `"${name}"`;
        duplicateWarnings.push(
          `${id} already exists in your portfolio. If you want to update the existing position, ask me to edit it — or give the new entry a different name to keep both.`
        );
        continue;
      }

      let resolvedValue = change.value || 0;
      let resolvedBuyPrice: number | null = change.buy_price || null;
      const isRealEstate = (change.type || "other") === "real_estate";

      // For real estate, derive native currency from country when Claude omits it.
      // For tradeables, Yahoo overrides this below. Other types default to EUR.
      let resolvedCurrency = change.currency || (
        isRealEstate ? countryToCurrency(change.country) : "EUR"
      );

      const resolved = resolvedPrices[i];
      if (resolved) {
        if (resolvedValue === 0) resolvedValue = resolved.value;
        if (!resolvedBuyPrice) resolvedBuyPrice = resolved.buyPrice;
        if (resolved.yahooCurrency) resolvedCurrency = resolved.yahooCurrency;
      }

      // Real estate: convert stated value and mortgage money fields from the property's
      // native currency to EUR. mortgage_rate is a percentage — not converted.
      let resolvedMortgageBalance = change.mortgage_balance ?? null;
      let resolvedMonthlyPayment = change.monthly_payment ?? null;
      if (isRealEstate && resolvedCurrency !== "EUR") {
        const [convVal, convBal, convPmt] = await Promise.all([
          resolvedValue > 0 ? toEur(resolvedValue, resolvedCurrency) : Promise.resolve(0),
          resolvedMortgageBalance != null ? toEur(resolvedMortgageBalance, resolvedCurrency) : Promise.resolve(null),
          resolvedMonthlyPayment != null ? toEur(resolvedMonthlyPayment, resolvedCurrency) : Promise.resolve(null),
        ]);
        if (convVal !== null) resolvedValue = Math.round(convVal);
        if (convBal !== null) resolvedMortgageBalance = Math.round(convBal);
        if (convPmt !== null) resolvedMonthlyPayment = Math.round(convPmt);
      }

      const resolvedLat: number | null = change.latitude ?? null;
      const resolvedLng: number | null = change.longitude ?? null;

      const { data: inserted, error } = await supabase.from("assets").insert({
        name,
        type: change.type || "other",
        value: resolvedValue,
        currency: resolvedCurrency,
        country: change.country || null,
        symbol: change.symbol || null,
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
        runningTotal += resolvedValue;
        await supabase.from("mutations").insert({
          user_id: userId,
          asset_id: inserted?.id || null,
          asset_name: name,
          action: "add",
          asset_type: change.type || "other",
          symbol: change.symbol || null,
          after_value: resolvedValue,
          before_units: null,
          after_units: change.units || null,
          currency: resolvedCurrency,
          personal_context: contextNote,
          portfolio_total: runningTotal,
          occurred_at: change.buy_date || new Date().toISOString().split("T")[0],
        });
      }

    } else if (action === "edit") {
      const existing = currentAssets.find(
        (a) => a.name.toLowerCase() === name.toLowerCase() ||
               (a.symbol && a.symbol.toLowerCase() === name.toLowerCase())
      );

      if (existing) {
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

        // Convert monetary fields from native currency to EUR for non-EUR real-estate edits.
        // Claude states values in the property's native currency (same convention as add).
        // mortgage_rate is a percentage — never converted.
        if (existing.type === "real_estate" && existing.currency && existing.currency !== "EUR") {
          const nativeCurrency = existing.currency;
          const monetaryFields = ["value", "mortgage_balance", "monthly_payment"] as const;
          const fieldLabels: Record<typeof monetaryFields[number], string> = {
            value: "property value",
            mortgage_balance: "mortgage balance",
            monthly_payment: "monthly payment",
          };
          const toConvert = monetaryFields.filter((f) => updateData[f] !== undefined);
          if (toConvert.length > 0) {
            const conversions = await Promise.all(
              toConvert.map((f) => toEur(updateData[f] as number, nativeCurrency))
            );
            const droppedLabels: string[] = [];
            const succeededLabels: string[] = [];
            toConvert.forEach((f, idx) => {
              const converted = conversions[idx];
              if (converted !== null) {
                updateData[f] = Math.round(converted);
                succeededLabels.push(fieldLabels[f]);
              } else {
                delete updateData[f];
                droppedLabels.push(fieldLabels[f]);
              }
            });
            if (droppedLabels.length > 0) {
              const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
              const warning = succeededLabels.length === 0
                ? `${cap(droppedLabels.join(" and "))} not updated — couldn't get a current ${nativeCurrency} rate. Try again in a moment.`
                : `Updated ${succeededLabels.join(" and ")}. ${cap(droppedLabels.join(" and "))} not updated — ${nativeCurrency} rate unavailable. Try again in a moment.`;
              fxWarnings.push(warning);
            }
          }
        }

        const { error } = await supabase.from("assets").update(updateData).eq("id", existing.id);

        if (error) {
          console.error("EDIT ERROR:", error);
        } else {
          changed = true;
          const afterValue = updateData.value !== undefined ? (updateData.value as number) : existing.value;
          runningTotal += afterValue - existing.value;

          const onlyNameChanged = Object.keys(updateData).length === 1 && updateData.name !== undefined;
          if (!onlyNameChanged) {
            await supabase.from("mutations").insert({
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
              currency: change.currency || existing.currency || "EUR",
              personal_context: contextNote,
              portfolio_total: runningTotal,
              occurred_at: change.buy_date || new Date().toISOString().split("T")[0],
            });
          }
        }
      }

    } else if (action === "remove") {
      const existing = currentAssets.find(
        (a) => a.name.toLowerCase() === name.toLowerCase() ||
               (a.symbol && a.symbol.toLowerCase() === name.toLowerCase())
      );

      if (existing) {
        const { error } = await supabase.from("assets").delete().eq("id", existing.id);

        if (error) {
          console.error("REMOVE ERROR:", error);
        } else {
          changed = true;
          runningTotal -= existing.value;
          await supabase.from("mutations").insert({
            user_id: userId,
            asset_id: existing.id,
            asset_name: name,
            action: "remove",
            asset_type: existing.type,
            symbol: existing.symbol || null,
            before_value: existing.value,
            before_units: existing.units || null,
            after_units: null,
            currency: existing.currency || "EUR",
            personal_context: contextNote,
            portfolio_total: runningTotal,
            occurred_at: new Date().toISOString().split("T")[0],
          });
        }
      }
    }
  }

  return { changed, duplicateWarnings, fxWarnings };
}

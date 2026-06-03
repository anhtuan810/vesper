import { ValueModeError } from "./apply-changes";
import { fetchYahooPrice } from "./prices-server";
import { fetchHistoricalPrice, normalizePrice } from "./prices";
import { normalizeCryptoSymbol } from "./symbol-aliases";
import { getUsdRates } from "./fx";

export type ProposalChange = {
  action: "add" | "edit" | "remove";
  name: string;
  type?: string;
  value?: number;
  value_delta?: number;
  currency?: string;
  symbol?: string;
  units?: number;
  buy_price?: number;
  buy_date?: string;
  personal_context?: string;
  [key: string]: unknown;
};

export type CurrentAssetLight = {
  name: string;
  type: string;
  value: number;
  currency?: string | null;
  symbol?: string | null;
  units?: number | null;
};

const TRADEABLE_TYPES_SET = new Set(["stocks", "etf", "crypto", "gold"]);

// Resolves a single proposed change for preview. Does NOT commit anything.
// Returns a human-readable resolved line to display alongside the proposal chips.
export async function resolveProposal(proposal: ProposalChange, currentAssets: CurrentAssetLight[]): Promise<string> {
  const { action, name } = proposal;

  if (action === "remove") {
    const existing = currentAssets.find(
      (a) => a.name.toLowerCase() === name.toLowerCase() ||
             (a.symbol && a.symbol.toLowerCase() === name.toLowerCase())
    );
    const cur = existing?.currency ?? "USD";
    const val = existing?.value ?? 0;
    const units = existing?.units ?? null;
    const unitStr = units != null ? `, ${units} shares` : "";
    return `Delete ${existing?.name ?? name} position (current value: ${cur} ${val.toLocaleString()}${unitStr})`;
  }

  if (action === "edit" && typeof proposal.value_delta === "number") {
    const existing = currentAssets.find(
      (a) => a.name.toLowerCase() === name.toLowerCase() ||
             (a.symbol && a.symbol.toLowerCase() === name.toLowerCase())
    );
    if (!existing?.symbol) {
      throw new ValueModeError(
        `Couldn't resolve a value-based change for ${name} — no symbol on file. Could you state the unit count instead?`
      );
    }
    const lookupSymbol = normalizeCryptoSymbol(existing.symbol, existing.type);
    const priceResult = await fetchYahooPrice(lookupSymbol);
    if (priceResult.error || !priceResult.price || priceResult.price <= 0) {
      throw new ValueModeError(
        `Couldn't fetch a live price for ${existing.symbol} right now — could you state the unit count instead?`
      );
    }
    const delta = proposal.value_delta;
    const decimals = existing.type === "crypto" ? 8 : 4;
    const factor = Math.pow(10, decimals);
    const unitsDelta = Math.round((delta / priceResult.price) * factor) / factor;
    const currentUnits = typeof existing.units === "number" ? existing.units : 0;
    const newUnits = Math.round((currentUnits + unitsDelta) * factor) / factor;
    const absDelta = Math.abs(delta);
    const absUnitsDelta = Math.abs(unitsDelta);
    const cur = priceResult.nativeCurrency;
    const price = priceResult.price;
    const verb = delta >= 0 ? "Buy" : "Sell";
    return `${verb} ${absUnitsDelta} ${existing.symbol} shares at ${cur} ${price.toFixed(2)} per share = ${cur} ${absDelta.toLocaleString()}, ${delta >= 0 ? "bringing" : "leaving"} total holding to ${newUnits} shares`;
  }

  // Historical re-derivation: edit with value + buy_date + no units → recompute units at historical price.
  if (action === "edit" && typeof proposal.value === "number" && proposal.value > 0 && proposal.buy_date && !proposal.units && !proposal.value_delta) {
    const existing = currentAssets.find(
      (a) => a.name.toLowerCase() === name.toLowerCase() ||
             (a.symbol && a.symbol.toLowerCase() === name.toLowerCase())
    );
    if (!existing?.symbol) {
      throw new ValueModeError(`No symbol on file for ${name} — couldn't look up the historical price.`);
    }
    const historical = await fetchHistoricalPrice(existing.symbol, proposal.buy_date);
    if (!historical) {
      throw new ValueModeError(
        `Couldn't fetch the price for ${existing.symbol} on ${proposal.buy_date} — try a different date or state the unit count directly.`
      );
    }
    const p = normalizePrice(historical.price, historical.currency);
    const cur = historical.currency === "GBp" ? "GBP" : historical.currency;
    const decimals = existing.type === "crypto" ? 8 : 4;
    const factor = Math.pow(10, decimals);
    const derivedUnits = Math.round((proposal.value / p) * factor) / factor;
    const derivedValue = Math.round(derivedUnits * p * 100) / 100;
    return `Update ${existing.name}: ${derivedUnits} shares at ${cur} ${p.toFixed(2)} on ${proposal.buy_date} = ${cur} ${derivedValue.toLocaleString()}`;
  }

  if (action === "add") {
    // Property: enumerate every financial field present in the proposal (plain
    // language, no field names) so the user can catch an omission before commit —
    // instead of the old fallthrough that described a property as "shares".
    if (proposal.type === "real_estate") {
      const cur = (typeof proposal.currency === "string" ? proposal.currency : "") || "";
      const num = (v: unknown): number | null =>
        typeof v === "number" && Number.isFinite(v) ? v : null;
      const money = (n: number) => `${cur} ${Math.round(n).toLocaleString()}`.trim();
      const parts: string[] = [];

      const value = num(proposal.value);
      if (value != null) parts.push(`valued at ${money(value)}`);

      const mortgageBalance = num(proposal.mortgage_balance);
      if (mortgageBalance != null) {
        parts.push(mortgageBalance > 0 ? `mortgage balance ${money(mortgageBalance)}` : "no mortgage");
      }

      const mortgageRate = num(proposal.mortgage_rate);
      if (mortgageRate != null) parts.push(`rate ${mortgageRate.toFixed(2)}%`);

      const monthlyPayment = num(proposal.monthly_payment);
      if (monthlyPayment != null) parts.push(`payment ${money(monthlyPayment)} per month`);

      const mortgageType = typeof proposal.mortgage_type === "string" ? proposal.mortgage_type : null;
      if (mortgageType) {
        const label = mortgageType === "annuity" ? "annuity"
          : mortgageType === "linear" ? "linear"
          : mortgageType === "interest_only" ? "interest-only"
          : mortgageType;
        parts.push(`${label} mortgage`);
      }

      if (proposal.buy_date) parts.push(`purchased ${proposal.buy_date}`);
      const buyPrice = num(proposal.buy_price);
      if (buyPrice != null) parts.push(`purchase price ${money(buyPrice)}`);

      const address = typeof proposal.address === "string" ? proposal.address : null;
      if (address) parts.push(`at ${address}`);

      return parts.length > 0 ? `Add ${name} — ${parts.join(", ")}` : `Add ${name}`;
    }

    const isTradeable = TRADEABLE_TYPES_SET.has(proposal.type ?? "");
    const hasUnits = typeof proposal.units === "number" && proposal.units > 0;
    const hasValue = typeof proposal.value === "number" && proposal.value > 0;

    if (isTradeable && proposal.symbol && !hasUnits && hasValue) {
      const lookupSymbol = normalizeCryptoSymbol(proposal.symbol, proposal.type);
      const priceResult = await fetchYahooPrice(lookupSymbol);
      if (priceResult.error || !priceResult.price || priceResult.price <= 0) {
        throw new ValueModeError(
          `Couldn't fetch a live price for ${proposal.symbol} right now — could you state the unit count instead?`
        );
      }
      const cur = priceResult.nativeCurrency;
      const price = priceResult.price;
      const decimals = proposal.type === "crypto" ? 8 : 4;
      const factor = Math.pow(10, decimals);

      const statedCurrency = proposal.currency ?? cur;
      let valueInPriceCurrency = proposal.value!;
      if (statedCurrency !== cur) {
        const rates = await getUsdRates();
        const fromRate = statedCurrency === "USD" ? 1 : (rates[statedCurrency] ?? 1);
        const toRate = cur === "USD" ? 1 : (rates[cur] ?? 1);
        valueInPriceCurrency = (proposal.value! / fromRate) * toRate;
      }

      const derivedUnits = Math.round((valueInPriceCurrency / price) * factor) / factor;
      const derivedValue = Math.round(derivedUnits * price * 100) / 100;
      return `Add ${derivedUnits} ${proposal.symbol} shares at ${cur} ${price.toFixed(2)} per share = ${cur} ${derivedValue.toLocaleString()}`;
    }

    const sym = proposal.symbol ?? name;
    const buyPrice = proposal.buy_price != null ? ` at ${proposal.currency ?? ""} ${proposal.buy_price} stated buy price` : "";
    const buyDate = proposal.buy_date ? ` on ${proposal.buy_date}` : "";
    const todayFlag = !proposal.buy_date ? " (today's date — change if incorrect)" : "";
    return `Add ${proposal.units ?? "?"} ${sym} shares${buyPrice}${buyDate}${todayFlag}`;
  }

  return `Update ${name} position`;
}

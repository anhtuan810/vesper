import { ValueModeError } from "./apply-changes";
import { fetchYahooPrice, fetchPriceWithFallback } from "./prices-server";
import { venueCountryForCurrency } from "./venues";
import { fetchHistoricalPrice, normalizePrice } from "./prices";
import { normalizeCryptoSymbol } from "./symbol-aliases";
import { getUsdRates } from "./fx";
import { estimatePropertyValue } from "./property-estimate-resolve";
import { validatePensionChange, buildPensionEcho } from "./pension-intake";
import { validateRealEstateChange } from "./real-estate-intake";
import { parseAcquisitionMonth } from "./acquisition-date";

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
    const reason = (proposal as { removal_reason?: string }).removal_reason === "mistake" ? "mistake" : "sold";
    const label = existing?.name ?? name;
    const valueStr = `${cur} ${val.toLocaleString()}${unitStr}`;
    return reason === "mistake"
      ? `Remove ${label} as a mistake — erased from your history (was ${valueStr})`
      : `Sell ${label} — kept in history up to the sale (current value: ${valueStr})`;
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
    // The model passes the date phrase through verbatim ("around March 2021");
    // deterministic code resolves it to a real date before any lookup or write.
    const resolvedBuyDate = parseAcquisitionMonth(proposal.buy_date);
    if (!resolvedBuyDate) {
      throw new ValueModeError(`Couldn't make out a date from "${proposal.buy_date}" — try a month and year.`);
    }
    proposal.buy_date = resolvedBuyDate;
    const historical = await fetchHistoricalPrice(existing.symbol, resolvedBuyDate);
    if (!historical) {
      throw new ValueModeError(
        `Couldn't fetch the price for ${existing.symbol} on ${resolvedBuyDate} — try a different date or state the unit count directly.`
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

  // A unit-count change on a held tradeable (buy more / trim / correct the count):
  // surface the resolved share delta and the new total so the user can verify it
  // before saving, instead of the generic "Update position" fallback. Cost basis is
  // filled silently at commit; the position's original acquisition date is preserved.
  if (action === "edit" && typeof proposal.units === "number" && typeof proposal.value_delta !== "number") {
    const existing = currentAssets.find(
      (a) => a.name.toLowerCase() === name.toLowerCase() ||
             (a.symbol && a.symbol.toLowerCase() === name.toLowerCase())
    );
    if (existing && typeof existing.units === "number" && TRADEABLE_TYPES_SET.has(existing.type)) {
      const label = existing.symbol ?? existing.name;
      const noun = existing.type === "crypto" ? "units" : existing.type === "gold" ? "oz" : "shares";
      const newUnits = proposal.units;
      const delta = Math.round((newUnits - existing.units) * 1e8) / 1e8;
      if (delta > 0) return `Buy ${delta} more ${label} ${noun}, bringing total holding to ${newUnits} ${noun}`;
      if (delta < 0) return `Reduce ${label} by ${Math.abs(delta)} ${noun}, leaving ${newUnits} ${noun}`;
      return `Set ${label} to ${newUnits} ${noun}`;
    }
  }

  if (action === "add") {
    // Pension: a confirmation echo of EVERY captured field for the shape. The
    // deterministic gate runs first — if any required field is missing, refuse
    // to produce a commit-able echo and surface the next question instead, so an
    // incomplete pension can never reach commit.
    if (proposal.type === "pension") {
      const gate = validatePensionChange(proposal);
      if (!gate.ok) throw new ValueModeError(gate.question);
      return buildPensionEcho(proposal, name);
    }

    // Property: the deterministic gate runs first — if the value can't be
    // resolved or the mortgage question is unanswered, refuse to produce a
    // commit-able echo and surface the next question instead, so a property can
    // never reach commit with a silent "owned outright" default.
    if (proposal.type === "real_estate") {
      const gate = validateRealEstateChange(proposal);
      if (!gate.ok) throw new ValueModeError(gate.question);

      // Enumerate every financial field present in the proposal (plain language,
      // no field names) so the user can catch an omission before commit —
      // instead of the old fallthrough that described a property as "shares".
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

      // Surface the mortgage start date too, so every mortgage field that will be
      // recorded (balance, rate, start) is visible in the confirm block before save.
      const mortgageStart = typeof proposal.mortgage_start_date === "string" ? proposal.mortgage_start_date : null;
      if (mortgageStart) parts.push(`mortgage started ${mortgageStart}`);

      if (proposal.buy_date) parts.push(`purchased ${proposal.buy_date}`);
      const buyPrice = num(proposal.buy_price);
      if (buyPrice != null) parts.push(`purchase price ${money(buyPrice)}`);

      const address = typeof proposal.address === "string" ? proposal.address : null;
      if (address) parts.push(`at ${address}`);

      const base = parts.length > 0
        ? `Add ${name}\n${parts.map((p) => `- ${p}`).join("\n")}`
        : `Add ${name}`;

      // Indicative current value: a logged purchase (price + date) but no stated
      // value. The figure is computed by the deterministic estimate engine — the
      // model never produces it. Falls through silently when unavailable so the
      // assistant can ask the user for a value instead.
      if (value == null && buyPrice != null && proposal.buy_date) {
        const country = typeof proposal.country === "string" ? proposal.country : null;
        const est = await estimatePropertyValue({ address, country, buyPrice, buyDate: proposal.buy_date });
        if (est.available && est.currentEstimate != null) {
          const since = est.clamped ? "1995" : String(proposal.buy_date).slice(0, 4);
          return `${base}\n\nCurrent value: about ${money(est.currentEstimate)} — indicative, based on ${est.regionName} price trends since ${since}, not an appraisal. Confirm, or give your own figure.`;
        }
      }

      return base;
    }

    // Simple value-based classes (cash / savings, bonds, other) — plus a typeless
    // add, which is stored as "other" at commit — echo the amount plainly, and
    // gate a value-less add: these are NOT live-priced, so units alone can't
    // produce a value and a missing value would persist a 0-value ghost. Keying on
    // "not tradeable" (rather than an explicit list) also gates the typeless case,
    // mirroring the write-path gate. pension/real_estate returned above already.
    if (!TRADEABLE_TYPES_SET.has(proposal.type ?? "")) {
      const value = typeof proposal.value === "number" && Number.isFinite(proposal.value) ? proposal.value : null;
      if (value == null || value <= 0) {
        throw new ValueModeError(`What's ${name} worth? I need a current value to record it.`);
      }
      const cur = (typeof proposal.currency === "string" ? proposal.currency : "") || "";
      const money = `${cur} ${Math.round(value).toLocaleString()}`.trim();
      const parts = [`valued at ${money}`];

      // Bond extras, when the user gave them.
      if (proposal.type === "bond" || proposal.type === "bonds") {
        const numOf = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
        const coupon = numOf(proposal.coupon_rate);
        if (coupon != null) parts.push(`${coupon}% coupon`);
        const maturity = typeof proposal.maturity_date === "string" ? proposal.maturity_date : null;
        if (maturity) parts.push(`matures ${maturity}`);
        const issuer = typeof proposal.issuer === "string" ? proposal.issuer : null;
        if (issuer) parts.push(`issued by ${issuer}`);
        const isin = typeof proposal.isin === "string" ? proposal.isin : null;
        if (isin) parts.push(`ISIN ${isin}`);
      }

      return `Add ${name}\n${parts.map((p) => `- ${p}`).join("\n")}`;
    }

    const isTradeable = TRADEABLE_TYPES_SET.has(proposal.type ?? "");
    const hasUnits = typeof proposal.units === "number" && proposal.units > 0;
    const hasValue = typeof proposal.value === "number" && proposal.value > 0;

    if (isTradeable && proposal.symbol && !hasUnits && hasValue) {
      const lookupSymbol = normalizeCryptoSymbol(proposal.symbol, proposal.type);
      // Venue-aware: a bare UCITS ETF ticker can't price directly, so fall back to
      // the listing matching the stated currency (we no longer ask the exchange) —
      // keeps a value-mode ETF add ("€5k of VWCE") working without a venue question.
      const priceResult = await fetchPriceWithFallback(lookupSymbol, venueCountryForCurrency(proposal.currency));
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

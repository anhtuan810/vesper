// Deterministic validation/normalization gate between Claude's scenario extraction
// and the compute. Embodies "AI parses, code validates": every extracted parameter
// is normalized and sanity-checked here, and anything implausible or missing returns
// a clarification instead of computing a confident wrong answer.
//
// Pure except for hypothetical_buy symbol resolution (the only async step).

import { resolveScenarioAsset, resolveHeldAsset, type AssetRef } from "@/lib/scenario/resolve-asset";
import { resolveMarketSymbol } from "@/lib/scenario/resolve-market-symbol";
import { isSupportedCurrency, type DisplayCurrency } from "@/lib/money";

export interface ScenarioGateContext {
  displayCurrency: DisplayCurrency;
  /** Quote-per-USD rates (the engine's UsdRates shape). */
  usdRates: Record<string, number>;
  now?: Date;
}

export interface ScenarioClarify {
  question: string;
  /** Chip options; when fewer than 2 the caller emits a plain question (no chips). */
  options: string[];
}

export type ScenarioGateResult =
  | { ok: Record<string, unknown> }
  | { clarify: ScenarioClarify };

// ── Sane bands ───────────────────────────────────────────────────────────────
const AMOUNT_FLOOR_USD = 10;        // below this, a buy "amount" is almost certainly a units misread
const AMOUNT_CEILING_USD = 1e12;    // a single hypothetical purchase beyond this is implausible
const VALUE_CEILING = 1e12;         // present-mode values/amounts (display currency)
const CONTRIB_CEILING = 1e9;        // future contribution per period
const TARGET_CEILING_USD = 1e13;    // solve-for target
const HORIZON_MAX_YEARS = 100;
const YEARS_AHEAD_MAX = 100;
const CCY_SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** ISO date as-is; relative token ("5y"/"18m"/"12w"/"90d") → that long ago; bare year → Jan 1; else (incl. null) → 5y ago. */
export function resolveBuyDate(hint: unknown, now: Date): string {
  if (typeof hint === "string") {
    const s = hint.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const rel = s.match(/^(\d+)\s*([ymwd])$/i);
    if (rel) {
      const n = Number(rel[1]);
      const unit = rel[2].toLowerCase();
      const d = new Date(now);
      if (unit === "y") d.setFullYear(d.getFullYear() - n);
      else if (unit === "m") d.setMonth(d.getMonth() - n);
      else if (unit === "w") d.setDate(d.getDate() - n * 7);
      else d.setDate(d.getDate() - n);
      return d.toISOString().slice(0, 10);
    }
    if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  }
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - 5);
  return d.toISOString().slice(0, 10);
}

const clarify = (question: string, options: string[] = []): ScenarioGateResult => ({ clarify: { question, options } });

// ── hypothetical_buy ──────────────────────────────────────────────────────────
async function gateHypotheticalBuy(intent: Record<string, unknown>, ctx: ScenarioGateContext): Promise<ScenarioGateResult> {
  const symbolHint = str(intent.symbolHint);
  if (!symbolHint) return clarify("Which asset did you have in mind — a name or ticker?");

  const resolved = await resolveMarketSymbol(symbolHint);
  if (resolved.kind === "ambiguous") {
    const labels = resolved.candidates.map((c) => c.label);
    return clarify(`Which did you mean: ${labels.join(", ")}?`, labels);
  }
  if (resolved.kind === "none") {
    return clarify(`I couldn't find a market symbol for "${symbolHint}". Which ticker or asset did you mean?`);
  }
  const { symbol, label } = resolved;

  const buyDateHint = resolveBuyDate(intent.buyDateHint, ctx.now ?? new Date());
  const base: Record<string, unknown> = {
    kind: "hypothetical_buy",
    symbolHint,
    buyDateHint,
    _resolved: { symbol, label },
  };

  // Units win when present — a bare number next to an asset name is units, not money.
  const units = num(intent.units);
  if (units != null) {
    if (units <= 0 || units > 1e12) return clarify(`How many units of ${label} did you mean?`);
    return { ok: { ...base, units, amount: null, currency: null } };
  }

  const amount = num(intent.amount);
  if (amount != null) {
    const cur = isSupportedCurrency(intent.currency) ? (intent.currency as string) : ctx.displayCurrency;
    const amountUsd = cur === "USD" ? amount : amount / (ctx.usdRates[cur] ?? 1);
    if (amountUsd <= 0) return clarify(`How much would you like to invest in ${label}?`);
    if (amountUsd < AMOUNT_FLOOR_USD) {
      // Almost-certain units misread ("1 BTC" → €1). Ask rather than compute.
      const sym = CCY_SYMBOL[cur] ?? "";
      return clarify(
        `Did you mean ${amount} ${label} (units), or ${sym}${amount}?`,
        [`${amount} ${label}`, "A cash amount"],
      );
    }
    if (amountUsd > AMOUNT_CEILING_USD) return clarify(`That amount looks too large — how much did you want to invest in ${label}?`);
    return { ok: { ...base, units: null, amount, currency: cur } };
  }

  // Neither units nor amount → the gate applies the €10,000 default (stated downstream).
  return { ok: { ...base, units: null, amount: 10_000, currency: ctx.displayCurrency, _defaulted: true } };
}

// ── present ────────────────────────────────────────────────────────────────────
function gatePresent(intent: Record<string, unknown>, assets: AssetRef[]): ScenarioGateResult {
  const mods = Array.isArray(intent.modifications) ? intent.modifications : [];
  if (mods.length === 0) return clarify("Which positions would you like to change, and by how much?");

  let valid = 0;
  for (const raw of mods) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const op = o.op;

    if (op === "add") {
      const name = str(o.name);
      const amount = num(o.amount);
      if (!name) return clarify("What would you like to add to the scenario?");
      if (amount == null || amount <= 0 || amount > VALUE_CEILING) return clarify(`How much ${name} would you like to add?`);
      valid++;
      continue;
    }
    if (op === "payMortgage") {
      const amount = num(o.amount);
      if (amount == null || amount <= 0 || amount > VALUE_CEILING) return clarify("How much would you like to pay off the mortgage?");
      valid++;
      continue;
    }

    const assetQ = str(o.asset);
    if (!assetQ) return clarify("Which position did you mean?");
    const res = resolveHeldAsset(assets, assetQ);
    if (res.kind === "ambiguous") return clarify(`Which position did you mean: ${res.matches.map((a) => a.name).join(", ")}?`, res.matches.map((a) => a.name));
    if (res.kind === "none") return clarify(`I don't see a held position matching "${assetQ}". Which one did you mean?`);

    if (op === "set") {
      const v = num(o.value);
      if (v == null || v < 0 || v > VALUE_CEILING) return clarify(`What value should ${res.asset.name} be set to?`);
    } else if (op === "sell" || op === "reduce") {
      const amt = num(o.amount);
      if (amt == null || amt <= 0 || amt > VALUE_CEILING) return clarify(`How much of ${res.asset.name} would you like to sell?`);
    } else if (op !== "remove") {
      continue; // unknown op — ignore, don't count
    }
    valid++;
  }

  if (valid === 0) return clarify("I couldn't read that scenario — which positions should change, and by how much?");
  return { ok: intent };
}

// ── future ───────────────────────────────────────────────────────────────────
function gateFuture(intent: Record<string, unknown>, ctx: ScenarioGateContext): ScenarioGateResult {
  if (intent.mode === "trajectory") {
    const h = num(intent.horizonYears);
    if (h != null && (h <= 0 || h > HORIZON_MAX_YEARS)) return clarify("Over how many years should I project?");
    const c = intent.contribution;
    if (c && typeof c === "object") {
      const amt = num((c as Record<string, unknown>).amount);
      if (amt != null && (amt < 0 || amt > CONTRIB_CEILING)) return clarify("How much would you contribute, and how often?");
      const freq = str((c as Record<string, unknown>).frequency);
      if (freq && !["monthly", "yearly", "annual"].includes(freq)) return clarify("Monthly or yearly contributions?");
    }
    return { ok: intent };
  }
  if (intent.mode === "solve") {
    const target = num(intent.target);
    if (target == null || target <= 0 || target > TARGET_CEILING_USD) return clarify("What target net worth are you aiming for?");
    const year = num(intent.targetYear);
    const curYear = (ctx.now ?? new Date()).getFullYear();
    if (year == null || year <= curYear || year > curYear + YEARS_AHEAD_MAX) return clarify("By which year would you like to reach it?");
    return { ok: intent };
  }
  return clarify("Would you like to project forward, or solve for a contribution to hit a target?");
}

// ── counterfactual (held look-back) ────────────────────────────────────────────
function gateCounterfactual(intent: Record<string, unknown>, assets: AssetRef[]): ScenarioGateResult {
  const assetQ = str(intent.asset);
  if (!assetQ) return clarify("Which held position should I look back at?");
  const res = resolveScenarioAsset(assets, assetQ);
  if (res.kind === "ambiguous") return clarify(`Which position did you mean: ${res.matches.map((a) => a.name).join(", ")}?`, res.matches.map((a) => a.name));
  if (res.kind === "non_tradeable") return clarify(`Look-back works for held tradeables — stocks, ETFs, or crypto. "${res.asset.name}" isn't one of those.`);
  if (res.kind === "none") return clarify(`I don't see a held position matching "${assetQ}". Which tradeable did you mean?`);
  return { ok: intent };
}

// ── portfolio_change (the unified before->after kind) ──────────────────────────
const SHOCK_CATEGORIES = new Set([
  "markets", "market", "equities", "stocks", "crypto", "property", "housing", "real_estate", "reserves", "cash", "all", "everything",
]);

async function gatePortfolioChange(intent: Record<string, unknown>, assets: AssetRef[], ctx: ScenarioGateContext): Promise<ScenarioGateResult> {
  const mods = Array.isArray(intent.modifications) ? intent.modifications : [];
  if (mods.length === 0) return clarify("What change would you like to explore?");

  let valid = 0;
  for (const raw of mods) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const action = o.action;

    if (action === "shock") {
      const cat = (str(o.asset) ?? "").toLowerCase();
      if (!SHOCK_CATEGORIES.has(cat)) return clarify("Which part of the market — equities, crypto, property, or everything?");
      const p = num(o.pct);
      if (p == null || p <= 0 || p > 100) return clarify("By how much would the market move (a percentage)?");
      valid++;
      continue;
    }

    if (action === "pay_mortgage") {
      const amount = num(o.amount);
      if (amount == null || amount <= 0 || amount > VALUE_CEILING) return clarify("How much would you pay off the mortgage?");
      valid++;
      continue;
    }

    if (action === "buy") {
      const assetQ = str(o.asset);
      if (!assetQ) return clarify("Which asset would you buy?");
      const units = num(o.units);
      const amount = num(o.amount);
      if (units != null) {
        if (units <= 0 || units > 1e12) return clarify(`How many units of ${assetQ}?`);
      } else if (amount != null) {
        const cur = isSupportedCurrency(o.currency) ? (o.currency as string) : ctx.displayCurrency;
        const amountUsd = cur === "USD" ? amount : amount / (ctx.usdRates[cur] ?? 1);
        if (amountUsd <= 0) return clarify(`How much would you put into ${assetQ}?`);
        if (amountUsd < AMOUNT_FLOOR_USD) {
          const sym = CCY_SYMBOL[cur] ?? "";
          return clarify(`Did you mean ${amount} ${assetQ} (units), or ${sym}${amount}?`, [`${amount} ${assetQ}`, "A cash amount"]);
        }
        if (amountUsd > AMOUNT_CEILING_USD) return clarify(`That amount looks too large — how much would you put into ${assetQ}?`);
      }
      // Resolve the asset: an existing holding to add to, or a market symbol.
      const held = resolveHeldAsset(assets, assetQ);
      if (held.kind === "ambiguous") return clarify(`Which position did you mean: ${held.matches.map((a) => a.name).join(", ")}?`, held.matches.map((a) => a.name));
      if (held.kind !== "resolved") {
        const mk = await resolveMarketSymbol(assetQ);
        if (mk.kind === "ambiguous") return clarify(`Which did you mean: ${mk.candidates.map((c) => c.label).join(", ")}?`, mk.candidates.map((c) => c.label));
        if (mk.kind === "none") return clarify(`I couldn't find "${assetQ}". Which asset did you mean?`);
      }
      valid++;
      continue;
    }

    // sell / set / remove — must target a held position.
    const assetQ = str(o.asset);
    if (!assetQ) return clarify("Which position did you mean?");
    const held = resolveHeldAsset(assets, assetQ);
    if (held.kind === "ambiguous") return clarify(`Which position did you mean: ${held.matches.map((a) => a.name).join(", ")}?`, held.matches.map((a) => a.name));
    if (held.kind !== "resolved") return clarify(`I don't see a held position matching "${assetQ}". Which one did you mean?`);
    if (action === "set") {
      const v = num(o.value);
      if (v == null || v < 0 || v > VALUE_CEILING) return clarify(`What value should ${held.asset.name} be set to?`);
    } else if (action === "sell" || action === "reduce") {
      const u = num(o.units), a = num(o.amount);
      if ((u == null || u <= 0) && (a == null || a <= 0)) return clarify(`How much of ${held.asset.name} would you like to sell?`);
    } else if (action !== "remove") {
      continue;
    }
    valid++;
  }

  if (valid === 0) return clarify("I couldn't read that — which positions should change, and by how much?");
  return { ok: intent };
}

/**
 * The gate. Normalizes and sanity-checks an extracted scenario intent. Returns the
 * normalized intent to compute, or a clarification to ask. Unknown kinds pass through.
 */
export async function validateScenarioIntent(
  intent: Record<string, unknown>,
  currentAssets: AssetRef[],
  ctx: ScenarioGateContext,
): Promise<ScenarioGateResult> {
  switch (intent.kind) {
    case "portfolio_change":
      return gatePortfolioChange(intent, currentAssets, ctx);
    case "hypothetical_buy":
      return gateHypotheticalBuy(intent, ctx);
    case "present":
      return gatePresent(intent, currentAssets);
    case "future":
      return gateFuture(intent, ctx);
    case "counterfactual":
      return gateCounterfactual(intent, currentAssets);
    default:
      return { ok: intent };
  }
}
